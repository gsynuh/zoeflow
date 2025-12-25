"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import type { VectorStoreItem } from "@/zoeflow/vectorstore/types";

type VectorStoreDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId?: string;
};

/**
 * Dialog for managing vector store entries (CRUD operations).
 */
export function VectorStoreDialog({
  open,
  onOpenChange,
  storeId,
}: VectorStoreDialogProps) {
  const [items, setItems] = useState<VectorStoreItem[]>([]);
  const [newText, setNewText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/vectorstore/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to load vector store items");
      }

      const data = await response.json();
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (open) {
      loadItems();
    }
  }, [open, loadItems]);

  const handleAdd = useCallback(async () => {
    const trimmed = newText.trim();
    if (!trimmed || isAdding) return;

    setIsAdding(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/vectorstore/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          items: [{ text: trimmed }],
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to add item");
      }

      setNewText("");
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsAdding(false);
    }
  }, [newText, storeId, isAdding, loadItems]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (isLoading) return;

      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/v1/vectorstore/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            ids: [id],
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error ?? "Failed to delete item");
        }

        await loadItems();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    [storeId, isLoading, loadItems],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" aria-label="Vector Store">
        <DialogHeader>
          <DialogTitle>Vector Store</DialogTitle>
          <DialogDescription>
            Manage vector store entries. Add text to embed and store, or remove
            existing entries.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2" aria-label="Add a new entry">
            <div className="text-sm font-medium">Add new entry</div>
            <Textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter text to embed and store..."
              className="min-h-20"
              disabled={isAdding}
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={handleAdd}
                disabled={!newText.trim() || isAdding}
                aria-label="Add entry"
              >
                <Plus className="h-4 w-4" />
                {isAdding ? "Adding..." : "Add Entry"}
              </Button>
              <div className="text-xs text-muted-foreground">
                Press Ctrl+Enter (Cmd+Enter on Mac) to add
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-2" aria-label="Manage entries">
            <div className="text-sm font-medium">Entries ({items.length})</div>
            <SimpleBar className="max-h-[45vh]">
              {isLoading && items.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  Loading...
                </div>
              ) : items.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No entries yet. Add one above to get started.
                </div>
              ) : (
                <ul className="divide-y">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 p-3 bg-background hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium wrap-break-word mb-1">
                          {item.text}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ID: {item.id}
                          {item.metadata &&
                            Object.keys(item.metadata).length > 0 && (
                              <span className="ml-2">
                                • {Object.keys(item.metadata).length} metadata
                                {Object.keys(item.metadata).length !== 1
                                  ? " fields"
                                  : " field"}
                              </span>
                            )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id)}
                        disabled={isLoading}
                        aria-label={`Delete entry ${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </SimpleBar>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
