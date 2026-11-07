"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { useShellStore, type DialogId } from "../store";

interface ModalDialogProps {
  dialog: DialogId;
  id: string;
  className?: string;
  onClose?: () => void;
  children: ReactNode;
}

/** Native <dialog>, opened modally while the shell store says it is the active dialog. */
export function ModalDialog({ dialog, id, className, onClose, children }: ModalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = useShellStore((s) => s.dialog === dialog);
  const closeDialog = useShellStore((s) => s.closeDialog);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      id={id}
      className={className}
      onClose={() => {
        if (useShellStore.getState().dialog === dialog) closeDialog();
        onClose?.();
      }}
    >
      {children}
    </dialog>
  );
}

interface DialogHeadProps {
  eyebrow: string;
  title: string;
}

export function DialogHead({ eyebrow, title }: DialogHeadProps) {
  const closeDialog = useShellStore((s) => s.closeDialog);
  return (
    <div className="dialoghead">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      <button type="button" className="close" aria-label="Close" onClick={closeDialog}>
        ×
      </button>
    </div>
  );
}
