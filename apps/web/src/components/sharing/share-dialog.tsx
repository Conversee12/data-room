'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { Check, Copy, Globe, Link2, Mail, Trash2, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { emailSchema, type NodeDto, type ShareDto } from '@data-room/shared';

import { Button } from '@/components/ui/button';
import { Dialog, DialogPanel } from '@/components/ui/dialog';
import { Input } from '@/components/ui/field';
import { LoadingBlock } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/api';
import {
  useAddGrant,
  useCreateShare,
  useRevokeGrant,
  useRevokeShare,
  useShares,
} from '@/lib/queries';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: NodeDto;
  /** True when this node is a data room's root, which changes the wording. */
  isDataRoom?: boolean;
}

/**
 * Sharing for any node. A data room, a folder and a single file all take the
 * same two forms — a link anyone can open, or a named list — because the API
 * treats a share as "this node and everything under it" regardless of depth.
 */
export function ShareDialog({ open, onOpenChange, node, isDataRoom }: ShareDialogProps) {
  const { data: shares, isLoading } = useShares(node.id, open);

  const publicShare = shares?.find((share) => share.mode === 'PUBLIC_LINK');
  const restrictedShare = shares?.find((share) => share.mode === 'RESTRICTED');

  const subject = isDataRoom ? 'this data room' : node.type === 'FOLDER' ? 'this folder' : 'this file';
  const scope = node.type === 'FOLDER' ? `${subject} and everything inside it` : subject;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPanel title={`Share “${node.name}”`} description="Recipients get read-only access.">
        {isLoading ? (
          <LoadingBlock label="Loading sharing settings" />
        ) : (
          <Tabs.Root defaultValue={restrictedShare && !publicShare ? 'people' : 'link'}>
            <Tabs.List className="mb-5 flex gap-1 rounded-lg bg-surface-muted p-1">
              <TabTrigger value="link" icon={Globe}>
                Anyone with the link
              </TabTrigger>
              <TabTrigger value="people" icon={Users}>
                Specific people
              </TabTrigger>
            </Tabs.List>

            <Tabs.Content value="link" className="focus:outline-none">
              <PublicLinkPanel node={node} share={publicShare} scope={scope} />
            </Tabs.Content>

            <Tabs.Content value="people" className="focus:outline-none">
              <RestrictedPanel node={node} share={restrictedShare} scope={scope} />
            </Tabs.Content>
          </Tabs.Root>
        )}
      </DialogPanel>
    </Dialog>
  );
}

function TabTrigger({
  value,
  icon: Icon,
  children,
}: {
  value: string;
  icon: typeof Globe;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        'text-ink-muted hover:text-ink',
        'data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-sm',
      )}
    >
      <Icon className="size-4" />
      {children}
    </Tabs.Trigger>
  );
}

function PublicLinkPanel({
  node,
  share,
  scope,
}: {
  node: NodeDto;
  share?: ShareDto;
  scope: string;
}) {
  const create = useCreateShare(node.id);
  const revoke = useRevokeShare(node.id);
  const [error, setError] = useState<string | null>(null);

  const enable = async () => {
    setError(null);
    try {
      await create.mutateAsync({ mode: 'PUBLIC_LINK', emails: [], expiresAt: null });
    } catch (createError) {
      setError(describeError(createError));
    }
  };

  if (!share) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Create a link and anyone who has it can view {scope}. No account needed.
        </p>
        <Button variant="primary" loading={create.isPending} onClick={enable}>
          <Link2 />
          Create link
        </Button>
        {error ? <ErrorLine message={error} /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ShareLinkRow token={share.token} />
      <p className="text-sm text-ink-muted">
        Anyone with this link can view {scope}. They cannot change anything.
      </p>
      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-sm text-ink-muted">Stop sharing with everyone who has the link</span>
        <Button
          variant="danger-ghost"
          size="sm"
          loading={revoke.isPending}
          onClick={() => revoke.mutate(share.id)}
        >
          Turn off link
        </Button>
      </div>
    </div>
  );
}

function RestrictedPanel({
  node,
  share,
  scope,
}: {
  node: NodeDto;
  share?: ShareDto;
  scope: string;
}) {
  const create = useCreateShare(node.id);
  const addGrant = useAddGrant(node.id);
  const revokeGrant = useRevokeGrant(node.id);
  const revoke = useRevokeShare(node.id);

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      return;
    }

    setError(null);
    try {
      // The first invitation creates the share; later ones extend it.
      if (share) await addGrant.mutateAsync({ shareId: share.id, email: parsed.data });
      else await create.mutateAsync({ mode: 'RESTRICTED', emails: [parsed.data], expiresAt: null });
      setEmail('');
    } catch (inviteError) {
      setError(describeError(inviteError));
    }
  };

  const grants = share?.grants ?? [];
  const pending = create.isPending || addGrant.isPending;

  return (
    <div className="space-y-4">
      <form onSubmit={invite} noValidate className="flex gap-2">
        <Input
          type="email"
          placeholder="name@company.com"
          value={email}
          aria-label="Email address"
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" variant="primary" loading={pending}>
          Invite
        </Button>
      </form>

      {error ? <ErrorLine message={error} /> : null}

      {grants.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Only people you invite can view {scope}. They will need to sign in with the email you add
          here.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {grants.map((grant) => (
            <li key={grant.id} className="flex items-center gap-3 px-3 py-2.5">
              <Mail className="size-4 shrink-0 text-ink-faint" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{grant.user?.name ?? grant.email}</p>
                {grant.user ? (
                  <p className="truncate text-xs text-ink-muted">{grant.email}</p>
                ) : (
                  <p className="text-xs text-ink-faint">Has not signed up yet</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${grant.email}`}
                onClick={() =>
                  share && revokeGrant.mutate({ shareId: share.id, grantId: grant.id })
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {share ? (
        <>
          <ShareLinkRow token={share.token} />
          <p className="text-sm text-ink-muted">
            Send this link to the people above. Anyone else who opens it is turned away.
          </p>
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-ink-muted">Revoke access for everyone listed</span>
            <Button
              variant="danger-ghost"
              size="sm"
              loading={revoke.isPending}
              onClick={() => revoke.mutate(share.id)}
            >
              Stop sharing
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ShareLinkRow({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/s/${token}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the input is selectable as a fallback.
      setCopied(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Input readOnly value={url} aria-label="Share link" onFocus={(e) => e.target.select()} />
      <Button variant="secondary" onClick={copy} className="shrink-0">
        {copied ? <Check className="text-success" /> : <Copy />}
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
