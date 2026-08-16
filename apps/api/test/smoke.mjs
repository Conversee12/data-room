/**
 * End-to-end check against a running API with its real database and storage.
 *
 * It covers the paths unit tests tend to miss: a signed upload that actually
 * transfers bytes, a materialized path that has to follow a moved folder, and a
 * share that must reach nested files while stopping at the edge of its subtree.
 *
 *   node apps/api/test/smoke.mjs
 *   API_URL=https://your-api.onrender.com node apps/api/test/smoke.mjs
 *
 * It registers throwaway accounts and deletes the data rooms it creates.
 */
const BASE = `${process.env.API_URL ?? 'http://localhost:4000'}/api`;
const stamp = Date.now();

let failures = 0;
function check(label, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || detail === undefined ? '' : `  -> ${JSON.stringify(detail)}`}`);
}

async function call(path, { method = 'GET', token, shareToken, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(shareToken ? { 'X-Share-Token': shareToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, body: json };
}

// A minimal but genuinely valid one-page PDF.
function makePdf(label) {
  const content = `BT /F1 24 Tf 72 700 Td (${label}) Tj ET`;
  const objects = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj',
    '4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    `5 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function uploadPdf({ token, parentId, name, onConflict = 'rename' }) {
  const bytes = makePdf(name);
  const intent = await call('/uploads', {
    method: 'POST',
    token,
    body: { parentId, name, size: bytes.length, mimeType: 'application/pdf', onConflict },
  });
  if (intent.status !== 201) return { intent, published: null };

  const put = await fetch(intent.body.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: bytes,
  });
  if (!put.ok) return { intent, put: put.status, published: null };

  const published = await call(`/uploads/${intent.body.versionId}/complete`, {
    method: 'POST',
    token,
  });
  return { intent, published };
}

const run = async () => {
  const health = await call('/health');
  check('health reports the database up', health.body?.database === 'up', health.body);

  // --- accounts -------------------------------------------------------
  const ownerEmail = `owner-${stamp}@example.com`;
  const viewerEmail = `viewer-${stamp}@example.com`;
  const strangerEmail = `stranger-${stamp}@example.com`;

  const owner = await call('/auth/register', {
    method: 'POST',
    body: { email: ownerEmail, password: 'correct horse battery', name: 'Owner' },
  });
  check('register returns a token', owner.status === 201 && owner.body.token, owner.body);
  const ownerToken = owner.body.token;

  const viewer = await call('/auth/register', {
    method: 'POST',
    body: { email: viewerEmail, password: 'correct horse battery', name: 'Viewer' },
  });
  const viewerToken = viewer.body.token;

  const stranger = await call('/auth/register', {
    method: 'POST',
    body: { email: strangerEmail, password: 'correct horse battery', name: 'Stranger' },
  });
  const strangerToken = stranger.body.token;

  const duplicate = await call('/auth/register', {
    method: 'POST',
    body: { email: ownerEmail, password: 'correct horse battery', name: 'Owner' },
  });
  check('duplicate email is rejected', duplicate.body?.code === 'EMAIL_TAKEN', duplicate.body);

  const badLogin = await call('/auth/login', {
    method: 'POST',
    body: { email: ownerEmail, password: 'wrong password' },
  });
  check('wrong password is rejected', badLogin.body?.code === 'INVALID_CREDENTIALS', badLogin.body);

  const noAuth = await call('/data-rooms');
  check('listing without a token is 401', noAuth.body?.code === 'UNAUTHENTICATED', noAuth.body);

  // --- data room ------------------------------------------------------
  const rooms = await call('/data-rooms', { token: ownerToken });
  check('registration seeds one data room', rooms.body?.length === 1, rooms.body);

  const room = await call('/data-rooms', {
    method: 'POST',
    token: ownerToken,
    body: { name: 'Acme Acquisition', description: 'Due diligence' },
  });
  check('data room is created', room.status === 201 && room.body.rootNodeId, room.body);
  const rootId = room.body.rootNodeId;

  // --- folders --------------------------------------------------------
  const legal = await call('/folders', {
    method: 'POST',
    token: ownerToken,
    body: { parentId: rootId, name: 'Legal' },
  });
  check('folder is created', legal.status === 201, legal.body);

  const contracts = await call('/folders', {
    method: 'POST',
    token: ownerToken,
    body: { parentId: legal.body.id, name: 'Contracts' },
  });
  check('nested folder is created', contracts.status === 201, contracts.body);

  const finance = await call('/folders', {
    method: 'POST',
    token: ownerToken,
    body: { parentId: rootId, name: 'Finance' },
  });

  const clash = await call('/folders', {
    method: 'POST',
    token: ownerToken,
    body: { parentId: rootId, name: 'legal' },
  });
  check('same name in one folder is rejected case-insensitively', clash.body?.code === 'NAME_CONFLICT', clash.body);

  const badName = await call('/folders', {
    method: 'POST',
    token: ownerToken,
    body: { parentId: rootId, name: 'in/valid' },
  });
  check('illegal characters are rejected', badName.body?.code === 'VALIDATION_FAILED', badName.body);

  // --- uploads --------------------------------------------------------
  const first = await uploadPdf({ token: ownerToken, parentId: contracts.body.id, name: 'nda.pdf' });
  check('upload publishes a file', first.published?.status === 200, first.published?.body ?? first);
  const ndaId = first.published?.body?.id;
  check('published file reports its real size', first.published?.body?.size > 0, first.published?.body);

  const renamed = await uploadPdf({ token: ownerToken, parentId: contracts.body.id, name: 'nda.pdf' });
  check(
    'same name uploaded again is auto-renamed',
    renamed.published?.body?.name === 'nda (1).pdf',
    renamed.published?.body,
  );

  const versioned = await uploadPdf({
    token: ownerToken,
    parentId: contracts.body.id,
    name: 'nda.pdf',
    onConflict: 'version',
  });
  check(
    'uploading as a new version keeps one node',
    versioned.published?.body?.id === ndaId && versioned.published?.body?.versionCount === 2,
    versioned.published?.body,
  );

  const versions = await call(`/nodes/${ndaId}/versions`, { token: ownerToken });
  check('both versions are listed', versions.body?.length === 2, versions.body);

  const tooBig = await call('/uploads', {
    method: 'POST',
    token: ownerToken,
    body: { parentId: contracts.body.id, name: 'huge.pdf', size: 999999999, mimeType: 'application/pdf', onConflict: 'rename' },
  });
  check('oversized upload is refused', tooBig.body?.code === 'VALIDATION_FAILED', tooBig.body);

  const wrongType = await call('/uploads', {
    method: 'POST',
    token: ownerToken,
    body: { parentId: contracts.body.id, name: 'sheet.xlsx', size: 100, mimeType: 'application/vnd.ms-excel', onConflict: 'rename' },
  });
  check('non-PDF upload is refused', wrongType.body?.code === 'VALIDATION_FAILED', wrongType.body);

  // --- reading --------------------------------------------------------
  const content = await call(`/nodes/${ndaId}/content`, { token: ownerToken });
  check('a signed content URL is issued', typeof content.body?.url === 'string', content.body);
  const fetched = await fetch(content.body.url);
  const fetchedBytes = Buffer.from(await fetched.arrayBuffer());
  check(
    'the signed URL serves the stored PDF',
    fetched.ok && fetchedBytes.subarray(0, 5).toString() === '%PDF-',
    { status: fetched.status, head: fetchedBytes.subarray(0, 8).toString() },
  );

  const listing = await call(`/nodes/${contracts.body.id}/children`, { token: ownerToken });
  check('folder listing returns both files', listing.body?.items?.length === 2, listing.body);

  const stats = await call(`/nodes/${rootId}/stats`, { token: ownerToken });
  check(
    'subtree stats count the whole tree',
    stats.body?.fileCount === 2 && stats.body?.folderCount === 3 && stats.body?.totalSize > 0,
    stats.body,
  );

  const detail = await call(`/nodes/${contracts.body.id}`, { token: ownerToken });
  check(
    'breadcrumbs run from the data room root',
    detail.body?.breadcrumbs?.map((crumb) => crumb.name).join('/') === 'Acme Acquisition/Legal/Contracts',
    detail.body?.breadcrumbs,
  );

  // --- rename and move -------------------------------------------------
  const renamedFile = await call(`/nodes/${ndaId}`, {
    method: 'PATCH',
    token: ownerToken,
    body: { name: 'mutual nda.pdf' },
  });
  check('file rename succeeds', renamedFile.body?.name === 'mutual nda.pdf', renamedFile.body);

  const conflictRename = await call(`/nodes/${ndaId}`, {
    method: 'PATCH',
    token: ownerToken,
    body: { name: 'nda (1).pdf' },
  });
  check('rename onto a taken name is rejected', conflictRename.body?.code === 'NAME_CONFLICT', conflictRename.body);

  const moved = await call(`/nodes/${ndaId}/move`, {
    method: 'POST',
    token: ownerToken,
    body: { parentId: finance.body.id },
  });
  check('file moves to another folder', moved.body?.parentId === finance.body.id, moved.body);

  const intoItself = await call(`/nodes/${legal.body.id}/move`, {
    method: 'POST',
    token: ownerToken,
    body: { parentId: contracts.body.id },
  });
  check('moving a folder into its own child is refused', intoItself.body?.code === 'INVALID_MOVE', intoItself.body);

  const movedFolder = await call(`/nodes/${contracts.body.id}/move`, {
    method: 'POST',
    token: ownerToken,
    body: { parentId: finance.body.id },
  });
  check('folder moves', movedFolder.body?.parentId === finance.body.id, movedFolder.body);

  const afterMove = await call(`/nodes/${renamed.published.body.id}`, { token: ownerToken });
  check(
    'descendants follow the moved folder',
    afterMove.body?.breadcrumbs?.map((crumb) => crumb.name).join('/') ===
      'Acme Acquisition/Finance/Contracts/nda (1).pdf',
    afterMove.body?.breadcrumbs,
  );

  // --- sharing --------------------------------------------------------
  const publicShare = await call('/shares', {
    method: 'POST',
    token: ownerToken,
    body: { nodeId: finance.body.id, mode: 'PUBLIC_LINK', emails: [], expiresAt: null },
  });
  check('public share is created', publicShare.status === 201 && publicShare.body.token, publicShare.body);
  const publicToken = publicShare.body.token;

  const anonContext = await call(`/shares/token/${publicToken}`);
  check('anonymous visitor resolves the public link', anonContext.body?.node?.id === finance.body.id, anonContext.body);

  const anonList = await call(`/nodes/${finance.body.id}/children`, { shareToken: publicToken });
  check('anonymous visitor lists the shared folder', anonList.status === 200, anonList.body);

  const anonDeep = await call(`/nodes/${renamed.published.body.id}/content`, { shareToken: publicToken });
  check('the share reaches nested files', typeof anonDeep.body?.url === 'string', anonDeep.body);

  const anonOutside = await call(`/nodes/${legal.body.id}/children`, { shareToken: publicToken });
  check('the share does not reach outside its subtree', anonOutside.body?.code === 'NOT_FOUND', anonOutside.body);

  const anonWrite = await call(`/nodes/${finance.body.id}`, {
    method: 'PATCH',
    shareToken: publicToken,
    body: { name: 'Hacked' },
  });
  check('a share grants no write access', anonWrite.status === 401, anonWrite.body);

  const anonBreadcrumbs = await call(`/nodes/${renamed.published.body.id}`, { shareToken: publicToken });
  check(
    'breadcrumbs stop at the share scope',
    anonBreadcrumbs.body?.breadcrumbs?.[0]?.name === 'Finance',
    anonBreadcrumbs.body?.breadcrumbs,
  );

  const restricted = await call('/shares', {
    method: 'POST',
    token: ownerToken,
    body: { nodeId: legal.body.id, mode: 'RESTRICTED', emails: [viewerEmail], expiresAt: null },
  });
  check('restricted share is created with a grant', restricted.body?.grants?.length === 1, restricted.body);
  const restrictedToken = restricted.body.token;

  const anonRestricted = await call(`/shares/token/${restrictedToken}`);
  check('a restricted link asks an anonymous visitor to sign in', anonRestricted.status === 401, anonRestricted.body);

  const strangerRestricted = await call(`/shares/token/${restrictedToken}`, { token: strangerToken });
  check('a restricted link refuses someone not on the list', strangerRestricted.status === 403, strangerRestricted.body);

  const viewerRestricted = await call(`/shares/token/${restrictedToken}`, { token: viewerToken });
  check('the granted user can open the restricted link', viewerRestricted.status === 200, viewerRestricted.body);

  const sharedWithMe = await call('/data-rooms/shared-with-me', { token: viewerToken });
  check('the item appears under "shared with me"', sharedWithMe.body?.length === 1, sharedWithMe.body);

  const viewerNoToken = await call(`/nodes/${legal.body.id}/children`, { token: viewerToken });
  check('the granted user reaches it without the link too', viewerNoToken.status === 200, viewerNoToken.body);

  await call(`/shares/${restricted.body.id}`, { method: 'DELETE', token: ownerToken });
  const afterRevoke = await call(`/shares/token/${restrictedToken}`, { token: viewerToken });
  check('a revoked link says so', afterRevoke.body?.code === 'SHARE_REVOKED', afterRevoke.body);

  const afterRevokeList = await call('/data-rooms/shared-with-me', { token: viewerToken });
  check('a revoked share leaves "shared with me"', afterRevokeList.body?.length === 0, afterRevokeList.body);

  // --- search ---------------------------------------------------------
  const search = await call(`/data-rooms/${room.body.id}/search?q=nda`, { token: ownerToken });
  check('search finds both files by name', search.body?.items?.length === 2, search.body);

  const scopedSearch = await call(
    `/data-rooms/${room.body.id}/search?q=nda&scopeNodeId=${finance.body.id}`,
    { shareToken: publicToken },
  );
  check('a viewer searches only inside their scope', scopedSearch.body?.items?.length === 2, scopedSearch.body);

  // --- deletion --------------------------------------------------------
  const deleteStats = await call(`/nodes/${finance.body.id}/stats`, { token: ownerToken });
  check('the delete warning knows what it will remove', deleteStats.body?.fileCount === 2, deleteStats.body);

  const removed = await call(`/nodes/${finance.body.id}`, { method: 'DELETE', token: ownerToken });
  check('folder delete reports what went', removed.body?.deleted?.fileCount === 2, removed.body);

  const goneChild = await call(`/nodes/${ndaId}`, { token: ownerToken });
  check('nested files are gone with the folder', goneChild.body?.code === 'NOT_FOUND', goneChild.body);

  const goneShare = await call(`/shares/token/${publicToken}`);
  check('a share of a deleted folder stops resolving', goneShare.body?.code === 'NOT_FOUND', goneShare.body);

  const rootDelete = await call(`/nodes/${rootId}`, { method: 'DELETE', token: ownerToken });
  check('the root folder cannot be deleted on its own', rootDelete.body?.code === 'VALIDATION_FAILED', rootDelete.body);

  const strangerPeek = await call(`/nodes/${rootId}`, { token: strangerToken });
  check('another account cannot see the data room', strangerPeek.body?.code === 'NOT_FOUND', strangerPeek.body);

  const roomGone = await call(`/data-rooms/${room.body.id}`, { method: 'DELETE', token: ownerToken });
  check('the data room is deleted', roomGone.status === 200, roomGone.body);

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error('Smoke run crashed:', error);
  process.exit(1);
});
