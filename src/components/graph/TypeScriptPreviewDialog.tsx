import { Copy } from "lucide-react";
import { useCallback, useMemo } from "react";
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
import { generateTypeScriptPreview } from "@/lib/graphToTypeScript";
import { openSystemDialog } from "@/stores/systemDialog";
import type { ZoeGraph } from "@/zoeflow/types";

export type TypeScriptPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graph: ZoeGraph;
};

/**
 * Dialog that renders the current graph as TypeScript code for easy sharing.
 */
export function TypeScriptPreviewDialog(props: TypeScriptPreviewDialogProps) {
  const { open, onOpenChange, graph } = props;

  const preview = useMemo(() => generateTypeScriptPreview(graph), [graph]);

  const onCopy = useCallback(() => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(preview);
      openSystemDialog({
        title: "Copied",
        message: "TypeScript preview copied to clipboard.",
      });
      return;
    }

    openSystemDialog({
      title: "Clipboard unavailable",
      message: "Select the code in the preview and copy it manually.",
    });
  }, [preview]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" aria-label="Preview as TypeScript">
        <DialogHeader>
          <DialogTitle>Preview as TypeScript</DialogTitle>
          <DialogDescription>
            TypeScript code that executes the same flow as your current graph.
          </DialogDescription>
        </DialogHeader>

        <SimpleBar className="max-h-[60vh]">
          <pre className="p-4 text-xs leading-relaxed">
            <code className="whitespace-pre">{preview}</code>
          </pre>
        </SimpleBar>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCopy}>
            <Copy className="h-4 w-4" />
            Copy
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
