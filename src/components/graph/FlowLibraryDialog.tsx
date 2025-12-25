import {
  Copy,
  Download,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  openSystemConfirmDialog,
  openSystemDialog,
  openSystemPromptDialog,
  SystemDialogVariant,
} from "@/stores/systemDialog";
import type { SavedFlow } from "@/zoeflow/storage/localFlows";
import { isShippedFlowId } from "@/zoeflow/storage/shippedFlows";

export type FlowLibraryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flows: SavedFlow[];
  currentFlowId: string;
  onLoadFlow: (flowId: string) => void;
  onCreateFlow: (name: string) => void;
  onRenameFlow: (flowId: string, nextName: string) => void;
  onDuplicateFlow: (flowId: string) => void;
  onDeleteFlow: (flowId: string) => void;
  onExportFlow: (flowId: string) => void;
  onExportCurrentFlow: () => void;
  onImportFlow: () => void;
  canSaveCurrentFlow: boolean;
  onSaveCurrentFlow: () => void;
};

/**
 * Flow picker / manager for local flows.
 */
export function FlowLibraryDialog(props: FlowLibraryDialogProps) {
  const {
    open,
    onOpenChange,
    flows,
    currentFlowId,
    onLoadFlow,
    onCreateFlow,
    onRenameFlow,
    onDuplicateFlow,
    onDeleteFlow,
    onExportFlow,
    onExportCurrentFlow,
    onImportFlow,
    canSaveCurrentFlow,
    onSaveCurrentFlow,
  } = props;

  const [createName, setCreateName] = useState<string>("Untitled flow");
  const [query, setQuery] = useState<string>("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const list = [...flows].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!trimmed) return list;
    return list.filter((flow) => flow.name.toLowerCase().includes(trimmed));
  }, [flows, query]);

  const onPromptRename = useCallback(
    (flow: SavedFlow) => {
      openSystemPromptDialog({
        title: "Rename flow",
        message: "Enter a new name for this flow.",
        inputLabel: "Flow name",
        defaultValue: flow.name,
        confirmLabel: "Rename",
        onConfirm: (nextName) => onRenameFlow(flow.id, nextName),
      });
    },
    [onRenameFlow],
  );

  const onConfirmDelete = useCallback(
    (flow: SavedFlow) => {
      if (isShippedFlowId(flow.id)) {
        openSystemDialog({
          title: "Cannot delete flow",
          message: "This is a built-in flow and cannot be deleted.",
          variant: SystemDialogVariant.Error,
        });
        return;
      }

      openSystemConfirmDialog({
        title: "Delete flow",
        message: `Delete “${flow.name}”? This cannot be undone.`,
        variant: SystemDialogVariant.Error,
        confirmLabel: "Delete",
        onConfirm: () => onDeleteFlow(flow.id),
      });
    },
    [onDeleteFlow],
  );

  const onClickLoad = useCallback(
    (flowId: string) => {
      onLoadFlow(flowId);
      onOpenChange(false);
    },
    [onLoadFlow, onOpenChange],
  );

  const onClickCreate = useCallback(() => {
    onCreateFlow(createName);
    onOpenChange(false);
  }, [createName, onCreateFlow, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label="Flows">
        <DialogHeader>
          <DialogTitle>Flows</DialogTitle>
          <DialogDescription>
            Open, rename, duplicate, export, import, or delete flows stored in
            this browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <section
            className="flex flex-col gap-2"
            aria-label="Create a new flow"
          >
            <div className="text-sm font-medium">Create</div>
            <div className="flex items-center gap-2">
              <Input
                value={createName}
                onChange={(event) => setCreateName(event.currentTarget.value)}
                placeholder="Untitled flow"
                aria-label="New flow name"
              />
              <Button
                type="button"
                onClick={onClickCreate}
                aria-label="Create flow"
              >
                <Plus className="h-4 w-4" />
                Create
              </Button>
            </div>
          </section>

          <section
            className="flex flex-col gap-2"
            aria-label="Manage saved flows"
          >
            <div className="text-sm font-medium">Flows</div>
            <Input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search flows"
              aria-label="Search flows"
            />

            <SimpleBar className="max-h-[45vh] rounded-md border">
              <ul className="divide-y">
                {filtered.length === 0 ? (
                  <li className="p-4 text-sm text-muted-foreground">
                    No flows found.
                  </li>
                ) : (
                  filtered.map((flow) => (
                    <li
                      key={flow.id}
                      className={[
                        "flex items-center gap-3 p-3",
                        flow.id === currentFlowId
                          ? "bg-muted/40"
                          : "bg-background",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => onClickLoad(flow.id)}
                        aria-label={`Open flow ${flow.name}`}
                      >
                        <div className="truncate text-sm font-medium">
                          {flow.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Updated {formatRelativeTime(flow.updatedAt)}
                        </div>
                      </button>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => onPromptRename(flow)}
                          aria-label={`Rename ${flow.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => onDuplicateFlow(flow.id)}
                          aria-label={`Duplicate ${flow.name}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => onExportFlow(flow.id)}
                          aria-label={`Export ${flow.name}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => onConfirmDelete(flow)}
                          aria-label={`Delete ${flow.name}`}
                          disabled={isShippedFlowId(flow.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </SimpleBar>
          </section>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={onSaveCurrentFlow}
            disabled={!canSaveCurrentFlow}
            aria-label="Save current flow"
          >
            <Save className="h-4 w-4" />
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onExportCurrentFlow}
            aria-label="Export current flow"
          >
            <Download className="h-4 w-4" />
            Export current
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onImportFlow}
            aria-label="Import flow"
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Format a timestamp into a short relative string.
 *
 * @param timestamp - Unix epoch millis.
 */
function formatRelativeTime(timestamp: number) {
  const delta = Date.now() - timestamp;
  if (!Number.isFinite(delta)) return "just now";
  if (delta < 10_000) return "just now";

  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
