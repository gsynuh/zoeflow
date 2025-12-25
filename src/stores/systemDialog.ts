import { atom } from "nanostores";

export enum SystemDialogKind {
  Alert = "alert",
  Confirm = "confirm",
  Prompt = "prompt",
}

export enum SystemDialogVariant {
  Info = "info",
  Error = "error",
}

export type SystemDialogPayload =
  | {
      kind: SystemDialogKind.Alert;
      title: string;
      message: string;
      variant: SystemDialogVariant;
    }
  | {
      kind: SystemDialogKind.Confirm;
      title: string;
      message: string;
      variant: SystemDialogVariant;
      confirmLabel?: string;
      cancelLabel?: string;
      onConfirm: () => void;
      onCancel?: () => void;
    }
  | {
      kind: SystemDialogKind.Prompt;
      title: string;
      message: string;
      variant: SystemDialogVariant;
      confirmLabel?: string;
      cancelLabel?: string;
      inputLabel?: string;
      placeholder?: string;
      defaultValue?: string;
      multiline?: boolean;
      onConfirm: (value: string) => void;
      onCancel?: () => void;
    };

export const $systemDialog = atom<SystemDialogPayload | null>(null);

/**
 * Open a system modal alert dialog with a title and message.
 *
 * @param payload - Dialog content to display.
 */
export function openSystemDialog(payload: {
  title: string;
  message: string;
  variant?: SystemDialogVariant;
}) {
  $systemDialog.set({
    kind: SystemDialogKind.Alert,
    title: payload.title,
    message: payload.message,
    variant: payload.variant ?? SystemDialogVariant.Info,
  });
}

/**
 * Open a system confirm dialog.
 *
 * @param payload - Dialog content and actions to display.
 */
export function openSystemConfirmDialog(payload: {
  title: string;
  message: string;
  variant?: SystemDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  $systemDialog.set({
    kind: SystemDialogKind.Confirm,
    title: payload.title,
    message: payload.message,
    variant: payload.variant ?? SystemDialogVariant.Info,
    confirmLabel: payload.confirmLabel,
    cancelLabel: payload.cancelLabel,
    onConfirm: payload.onConfirm,
    onCancel: payload.onCancel,
  });
}

/**
 * Open a system prompt dialog.
 *
 * @param payload - Dialog content and actions to display.
 */
export function openSystemPromptDialog(payload: {
  title: string;
  message: string;
  variant?: SystemDialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  inputLabel?: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  onConfirm: (value: string) => void;
  onCancel?: () => void;
}) {
  $systemDialog.set({
    kind: SystemDialogKind.Prompt,
    title: payload.title,
    message: payload.message,
    variant: payload.variant ?? SystemDialogVariant.Info,
    confirmLabel: payload.confirmLabel,
    cancelLabel: payload.cancelLabel,
    inputLabel: payload.inputLabel,
    placeholder: payload.placeholder,
    defaultValue: payload.defaultValue,
    multiline: payload.multiline,
    onConfirm: payload.onConfirm,
    onCancel: payload.onCancel,
  });
}

/**
 * Close the active system dialog.
 */
export function closeSystemDialog() {
  $systemDialog.set(null);
}
