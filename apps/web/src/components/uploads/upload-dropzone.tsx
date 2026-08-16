'use client';

import { UploadCloud } from 'lucide-react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';

interface UploadDropzoneProps {
  /** Receives the dropped files; conflicts are settled by the caller. */
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  children: ReactNode;
}

/** Drop target for the folder currently on screen. */
export function UploadDropzone({ onFiles, disabled, children }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  // Nested elements fire their own dragenter/dragleave; counting keeps the
  // highlight from flickering as the pointer crosses children.
  const depth = useRef(0);

  return (
    <div
      onDragEnter={(event: DragEvent) => {
        event.preventDefault();
        if (disabled) return;
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event: DragEvent) => event.preventDefault()}
      onDragLeave={(event: DragEvent) => {
        event.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        if (disabled) return;
        onFiles(Array.from(event.dataTransfer.files));
      }}
      className="relative"
    >
      {children}

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-card border-2 border-dashed border-accent bg-accent-soft/80 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 text-accent">
            <UploadCloud className="size-7" />
            <p className="text-sm font-medium">Drop PDFs to upload them here</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
