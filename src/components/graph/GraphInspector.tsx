"use client";

import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { openSystemConfirmDialog } from "@/stores/systemDialog";
import {
  getNestedValue,
  setNestedValue,
} from "@/zoeflow/nodes/globalState/utils";
import SimpleBar from "simplebar-react";

export type GraphInspectorProps = {
  vars: Record<string, unknown>;
  onUpdateVars: (vars: Record<string, unknown>) => void;
};

/**
 * Render the graph inspector panel showing global variables with CRUD operations.
 */
export function GraphInspector({ vars, onUpdateVars }: GraphInspectorProps) {
  const [managerOpen, setManagerOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const entries = Object.entries(vars);

  const handleManagerOpen = useCallback(() => {
    setManagerOpen(true);
  }, []);

  const handleManagerOpenChange = useCallback((open: boolean) => {
    setManagerOpen(open);
    if (!open) {
      setAddDialogOpen(false);
      setEditDialogOpen(false);
      setEditingPath(null);
      setEditingValue("");
    }
  }, []);

  const prepareEditingValue = useCallback(
    (path: string) => {
      const rawValue = getNestedValue(vars, path);
      if (typeof rawValue === "string") {
        return rawValue;
      }
      try {
        return JSON.stringify(rawValue, null, 2);
      } catch {
        return "";
      }
    },
    [vars],
  );

  const handleAdd = useCallback(() => {
    setAddDialogOpen(true);
  }, []);

  const handleEdit = useCallback(
    (path: string) => {
      setEditingPath(path);
      setEditingValue(prepareEditingValue(path));
      setEditDialogOpen(true);
    },
    [prepareEditingValue],
  );

  const handleDelete = useCallback(
    (path: string) => {
      openSystemConfirmDialog({
        title: "Delete variable",
        message: `Are you sure you want to delete the variable "${path}"?`,
        confirmLabel: "Delete",
        onConfirm: () => {
          const newVars = { ...vars };
          const parts = path.split(".");
          if (parts.length === 1) {
            delete newVars[path];
          } else {
            let current: Record<string, unknown> = newVars;
            for (let i = 0; i < parts.length - 1; i++) {
              const part = parts[i];
              if (
                typeof current[part] !== "object" ||
                current[part] === null ||
                Array.isArray(current[part])
              ) {
                return;
              }
              current = current[part] as Record<string, unknown>;
            }
            delete current[parts[parts.length - 1]];
          }
          onUpdateVars(newVars);
        },
      });
    },
    [vars, onUpdateVars],
  );

  const handleAddConfirm = useCallback(
    (path: string, value: string) => {
      try {
        const parsedValue = JSON.parse(value);
        const newVars = { ...vars };
        setNestedValue(newVars, path, parsedValue);
        onUpdateVars(newVars);
        setAddDialogOpen(false);
      } catch {
        // If JSON parsing fails, treat as string
        const newVars = { ...vars };
        setNestedValue(newVars, path, value);
        onUpdateVars(newVars);
        setAddDialogOpen(false);
      }
    },
    [vars, onUpdateVars],
  );

  const handleEditConfirm = useCallback(
    (path: string, value: string) => {
      try {
        const parsedValue = JSON.parse(value);
        const newVars = { ...vars };
        setNestedValue(newVars, path, parsedValue);
        onUpdateVars(newVars);
        setEditDialogOpen(false);
        setEditingPath(null);
      } catch {
        // If JSON parsing fails, treat as string
        const newVars = { ...vars };
        setNestedValue(newVars, path, value);
        onUpdateVars(newVars);
        setEditDialogOpen(false);
        setEditingPath(null);
      }
    },
    [vars, onUpdateVars],
  );

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Global Variables</div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleManagerOpen}
          className="h-7"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
      </div>

      <GlobalVariablesManagerDialog
        open={managerOpen}
        onOpenChange={handleManagerOpenChange}
        entries={entries}
        onRequestAdd={handleAdd}
        onRequestEdit={handleEdit}
        onDelete={handleDelete}
      />

      <AddVariableDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onConfirm={handleAddConfirm}
      />

      {editingPath && (
        <EditVariableDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) {
              setEditingPath(null);
              setEditingValue("");
            }
          }}
          path={editingPath}
          value={editingValue}
          onConfirm={handleEditConfirm}
          onValueChange={setEditingValue}
        />
      )}
    </div>
  );
}

type GlobalVariablesManagerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: Array<[string, unknown]>;
  onRequestAdd: () => void;
  onRequestEdit: (path: string) => void;
  onDelete: (path: string) => void;
};

/**
 * Modal that exposes the list of global variables and actions to manage them.
 */
function GlobalVariablesManagerDialog({
  open,
  onOpenChange,
  entries,
  onRequestAdd,
  onRequestEdit,
  onDelete,
}: GlobalVariablesManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100vw-2rem,720px)]">
        <DialogHeader>
          <DialogTitle>Global Variables</DialogTitle>
          <DialogDescription>
            Manage values that are shared across nodes and tools.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {entries.length === 0
              ? "No variables defined yet."
              : `${entries.length} global variable${
                  entries.length === 1 ? "" : "s"
                } saved.`}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="space-x-1"
            onClick={onRequestAdd}
          >
            <Plus className="h-3 w-3" />
            <span>Add variable</span>
          </Button>
        </div>

        <SimpleBar className="max-h-[55vh]">
          <div className="px-6 pb-3 space-y-1">
            {entries.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No variables yet. Use &ldquo;Add variable&rdquo; to create one,
                or let Set Variable nodes populate the state.
              </div>
            ) : (
              <div className="space-y-1">
                {entries.map(([key, value]) => (
                  <VariableEntry
                    key={key}
                    path={key}
                    value={value}
                    onEdit={onRequestEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        </SimpleBar>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type VariableEntryProps = {
  path: string;
  value: unknown;
  prefix?: string;
  onEdit: (path: string) => void;
  onDelete: (path: string) => void;
};

/**
 * Render a single variable entry, handling nested objects and arrays recursively.
 */
function VariableEntry({
  path,
  value,
  prefix = "",
  onEdit,
  onDelete,
}: VariableEntryProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const fullPath = prefix ? `${prefix}.${path}` : path;
  const isObject =
    typeof value === "object" && value !== null && !Array.isArray(value);
  const isArray = Array.isArray(value);

  if (isObject) {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <div className="pl-2">
        <div className="flex items-center gap-1 group">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-sm hover:text-foreground text-muted-foreground flex-1"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span className="font-mono">{path}</span>
            <span className="text-xs">
              ({entries.length} {entries.length === 1 ? "key" : "keys"})
            </span>
          </button>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(fullPath)}
              className="p-1 hover:bg-muted rounded"
              aria-label={`Edit ${fullPath}`}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(fullPath)}
              className="p-1 hover:bg-muted rounded"
              aria-label={`Delete ${fullPath}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        {isExpanded && (
          <div className="pl-4 mt-1 space-y-1">
            {entries.map(([key, val]) => (
              <VariableEntry
                key={key}
                path={key}
                value={val}
                prefix={fullPath}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isArray) {
    const array = value as unknown[];
    return (
      <div className="pl-2">
        <div className="flex items-center gap-1 group">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-sm hover:text-foreground text-muted-foreground flex-1"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span className="font-mono">{path}</span>
            <span className="text-xs">
              ({array.length} {array.length === 1 ? "item" : "items"})
            </span>
          </button>
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(fullPath)}
              className="p-1 hover:bg-muted rounded"
              aria-label={`Edit ${fullPath}`}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(fullPath)}
              className="p-1 hover:bg-muted rounded"
              aria-label={`Delete ${fullPath}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        {isExpanded && (
          <div className="pl-4 mt-1 space-y-1">
            {array.map((item, index) => (
              <VariableEntry
                key={index}
                path={`[${index}]`}
                value={item}
                prefix={fullPath}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pl-2 text-sm group flex items-center gap-2">
      <div className="flex-1">
        <span className="font-mono text-muted-foreground">{fullPath}</span>
        <span className="mx-2 text-muted-foreground">=</span>
        <span className="font-mono">{formatValue(value)}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          ({getTypeName(value)})
        </span>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(fullPath)}
          className="p-1 hover:bg-muted rounded"
          aria-label={`Edit ${fullPath}`}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(fullPath)}
          className="p-1 hover:bg-muted rounded"
          aria-label={`Delete ${fullPath}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

type AddVariableDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (path: string, value: string) => void;
};

/**
 * Dialog for creating a new global variable using a dot-notated path/value.
 */
function AddVariableDialog({
  open,
  onOpenChange,
  onConfirm,
}: AddVariableDialogProps) {
  const [path, setPath] = useState("");
  const [value, setValue] = useState("");

  const handleConfirm = useCallback(() => {
    if (!path.trim()) return;
    onConfirm(path.trim(), value);
    setPath("");
    setValue("");
  }, [path, value, onConfirm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label="Add Variable">
        <DialogHeader>
          <DialogTitle>Add Variable</DialogTitle>
          <DialogDescription>
            Create a new global variable. Use dot-notation for nested paths
            (e.g., &quot;user.name&quot;).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-path">Path</Label>
            <Input
              id="add-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="e.g., user.name or settings.theme"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-value">Value (JSON or plain text)</Label>
            <Textarea
              id="add-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='e.g., "John" or {"key": "value"}'
              className="min-h-[100px] font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!path.trim()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EditVariableDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  value: string;
  onConfirm: (path: string, value: string) => void;
  onValueChange: (value: string) => void;
};

/**
 * Dialog for editing an existing global variable value.
 */
function EditVariableDialog({
  open,
  onOpenChange,
  path,
  value,
  onConfirm,
  onValueChange,
}: EditVariableDialogProps) {
  const handleConfirm = useCallback(() => {
    onConfirm(path, value);
  }, [path, value, onConfirm]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label="Edit Variable">
        <DialogHeader>
          <DialogTitle>Edit Variable</DialogTitle>
          <DialogDescription>
            Edit the value for &quot;{path}&quot;. Use JSON format for objects/
            arrays, or plain text for strings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="edit-value">Value (JSON or plain text)</Label>
          <Textarea
            id="edit-value"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Format a value for display (for primitive values only).
 */
function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Get a human-readable type name for a value.
 */
function getTypeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
