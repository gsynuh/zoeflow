import {
  Brain,
  Code,
  Database,
  Moon,
  Origami,
  Save,
  Sun,
  Waypoints,
} from "lucide-react";
import { useCallback, useState } from "react";

import { FlowLibraryDialog } from "@/components/graph/FlowLibraryDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { classNames } from "@/lib/utils";
import type { SavedFlow } from "@/zoeflow/storage/localFlows";
import packageInfo from "../../../package.json";

export type GraphToolbarProps = {
  className?: string;
  flowName: string;
  isDirty: boolean;
  canSave: boolean;
  selectedFlowId: string;
  savedFlows: SavedFlow[];
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  onFlowNameChange: (next: string) => void;
  onSave: () => void;
  onCreateFlow: (name: string) => void;
  onLoadFlow: (flowId: string) => void;
  onRenameFlow: (flowId: string, nextName: string) => void;
  onDuplicateFlow: (flowId: string) => void;
  onDeleteFlow: (flowId: string) => void;
  onExportFlow: (flowId: string) => void;
  onExportCurrentFlow: () => void;
  onImportFlow: () => void;
  onOpenTypeScriptPreview: () => void;
  onOpenVectorStore: () => void;
  onOpenModels: () => void;
};

/**
 * Top toolbar for the graph editor (current flow + flow library entry point).
 */
export function GraphToolbar(props: GraphToolbarProps) {
  const {
    className,
    flowName,
    isDirty,
    canSave,
    selectedFlowId,
    savedFlows,
    themeMode,
    onToggleTheme,
    onFlowNameChange,
    onSave,
    onCreateFlow,
    onLoadFlow,
    onRenameFlow,
    onDuplicateFlow,
    onDeleteFlow,
    onExportFlow,
    onExportCurrentFlow,
    onImportFlow,
    onOpenTypeScriptPreview,
    onOpenVectorStore,
    onOpenModels,
  } = props;

  const [flowsOpen, setFlowsOpen] = useState(false);

  const onOpenFlows = useCallback(() => {
    setFlowsOpen(true);
  }, []);

  return (
    <>
      <header
        className={classNames(
          className,
          "flex items-center gap-3 px-4 border-b bg-background",
        )}
      >
        <div className="font-semibold tracking-tight flex rows text-lg items-center gap-2 m-2">
          <Origami
            strokeWidth={1.5}
            className={classNames("size-6 text-brand")}
          />
          <span className="text-brand">ZoeFlow</span>
          <span className="text-xs text-muted-foreground">
            v{packageInfo.version}
          </span>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={onOpenFlows}
          aria-label="Flows"
        >
          <Waypoints className="h-4 w-4" />
          Flows
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onOpenTypeScriptPreview}
          aria-label="Preview as TypeScript"
        >
          <Code className="h-4 w-4" />
          Preview
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onOpenVectorStore}
          aria-label="Vector Stores"
        >
          <Database className="h-4 w-4" />
          Vector Stores
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onOpenModels}
          aria-label="Models"
        >
          <Brain className="h-4 w-4" />
          Models
        </Button>

        <Separator orientation="vertical" className="h-6" />
        <div className="flex min-w-0 items-center gap-2">
          <Input
            value={flowName}
            onChange={(event) => onFlowNameChange(event.currentTarget.value)}
            placeholder="Flow name"
            aria-label="Flow name"
            className="h-8 w-[260px]"
          />
          {isDirty ? (
            <span
              className="text-xs text-muted-foreground"
              aria-label="Unsaved changes"
            >
              Unsaved
            </span>
          ) : null}

          <Button
            size="sm"
            onClick={onSave}
            disabled={!canSave}
            aria-label="Save flow"
          >
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>

        <div className="ml-auto" />

        <Button
          size="icon"
          variant="ghost"
          onClick={onToggleTheme}
          aria-label={
            themeMode === "dark"
              ? "Switch to light mode"
              : "Switch to dark mode"
          }
        >
          {themeMode === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </header>

      <FlowLibraryDialog
        open={flowsOpen}
        onOpenChange={setFlowsOpen}
        flows={savedFlows}
        currentFlowId={selectedFlowId}
        onLoadFlow={onLoadFlow}
        onCreateFlow={onCreateFlow}
        onRenameFlow={onRenameFlow}
        onDuplicateFlow={onDuplicateFlow}
        onDeleteFlow={onDeleteFlow}
        onExportFlow={onExportFlow}
        onExportCurrentFlow={onExportCurrentFlow}
        onImportFlow={onImportFlow}
        canSaveCurrentFlow={canSave}
        onSaveCurrentFlow={onSave}
      />
    </>
  );
}
