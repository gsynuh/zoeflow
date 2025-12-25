"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VectorStoreManager } from "./VectorStoreManager";

type VectorStoreDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function VectorStoreDialog({
  open,
  onOpenChange,
}: VectorStoreDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[min(960px,100vw)] h-[90vh] min-h-[520px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Document Vector Stores</DialogTitle>
          <DialogDescription>
            Manage vector stores, upload markdown documents, and monitor
            processing status without leaving the graph editor.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <VectorStoreManager />
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
