"use client";

import { useStore } from "@nanostores/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  $systemDialog,
  closeSystemDialog,
  SystemDialogKind,
  SystemDialogVariant,
} from "@/stores/systemDialog";

/**
 * Render the global system dialog host for informational modals.
 */
export function SystemDialogHost() {
  const dialog = useStore($systemDialog);
  const isOpen = Boolean(dialog);

  const [promptValue, setPromptValue] = useState("");

  const onOpenChange = useCallback((open: boolean) => {
    if (!open) closeSystemDialog();
  }, []);

  const kind = dialog?.kind ?? SystemDialogKind.Alert;
  const title = dialog?.title ?? "";
  const message = dialog?.message ?? "";
  const variant = dialog?.variant ?? SystemDialogVariant.Info;
  const isError = variant === SystemDialogVariant.Error;

  const confirmLabel = useMemo(() => {
    if (!dialog) return "OK";
    if (dialog.kind === SystemDialogKind.Confirm)
      return dialog.confirmLabel ?? "Confirm";
    if (dialog.kind === SystemDialogKind.Prompt)
      return dialog.confirmLabel ?? "Confirm";
    return "OK";
  }, [dialog]);

  const cancelLabel = useMemo(() => {
    if (!dialog) return "Cancel";
    if (dialog.kind === SystemDialogKind.Confirm)
      return dialog.cancelLabel ?? "Cancel";
    if (dialog.kind === SystemDialogKind.Prompt)
      return dialog.cancelLabel ?? "Cancel";
    return "Cancel";
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    if (dialog.kind !== SystemDialogKind.Prompt) return;
    setPromptValue(dialog.defaultValue ?? "");
  }, [dialog]);

  const onConfirm = useCallback(() => {
    if (!dialog) return;

    try {
      if (dialog.kind === SystemDialogKind.Confirm) {
        dialog.onConfirm();
      } else if (dialog.kind === SystemDialogKind.Prompt) {
        dialog.onConfirm(promptValue);
      }
    } finally {
      closeSystemDialog();
    }
  }, [dialog, promptValue]);

  const onCancel = useCallback(() => {
    if (!dialog) return;

    try {
      if (dialog.kind === SystemDialogKind.Confirm) {
        dialog.onCancel?.();
      } else if (dialog.kind === SystemDialogKind.Prompt) {
        dialog.onCancel?.();
      }
    } finally {
      closeSystemDialog();
    }
  }, [dialog]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className={isError ? "text-brand" : undefined}>
            {title}
          </DialogTitle>
          <DialogDescription className="max-h-[50svh] overflow-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {message}
          </DialogDescription>
        </DialogHeader>
        {dialog?.kind === SystemDialogKind.Prompt ? (
          dialog.multiline ? (
            <Textarea
              value={promptValue}
              onChange={(event) => setPromptValue(event.currentTarget.value)}
              placeholder={dialog.placeholder}
              aria-label={dialog.inputLabel ?? "Input"}
              className="min-h-[160px]"
            />
          ) : (
            <Input
              value={promptValue}
              onChange={(event) => setPromptValue(event.currentTarget.value)}
              placeholder={dialog.placeholder}
              aria-label={dialog.inputLabel ?? "Input"}
            />
          )
        ) : null}
        <DialogFooter>
          {kind === SystemDialogKind.Alert ? (
            <DialogClose asChild>
              <Button type="button">OK</Button>
            </DialogClose>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onCancel}>
                {cancelLabel}
              </Button>
              <Button type="button" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
