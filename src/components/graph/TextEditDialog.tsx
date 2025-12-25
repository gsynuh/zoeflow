"use client";

import { useCallback, useState } from "react";
import SimpleBar from "simplebar-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type TextEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
};

/**
 * Dialog for editing text attributes with a larger textarea.
 */
export function TextEditDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  value,
  onSave,
  placeholder,
}: TextEditDialogProps) {
  const [editedValue, setEditedValue] = useState(value);

  const handleSave = useCallback(() => {
    onSave(editedValue);
    onOpenChange(false);
  }, [editedValue, onSave, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-label={title}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium">{label}</label>
          <SimpleBar className="max-h-[50vh]">
            <Textarea
              value={editedValue}
              onChange={(e) => setEditedValue(e.target.value)}
              placeholder={placeholder}
              className="min-h-[200px] font-mono text-sm"
            />
          </SimpleBar>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
