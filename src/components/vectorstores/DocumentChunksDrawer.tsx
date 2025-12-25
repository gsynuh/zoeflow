"use client";

import { ChevronLeft, ChevronRight, GripVertical, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import SimpleBar from "simplebar-react";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type ChunkData = {
  id: string;
  text: string;
  metadata: Record<string, unknown>;
};

type DocumentChunksDrawerProps = {
  docId: string;
  storeId: string;
  sourceUri: string;
  onClose: () => void;
};

const MIN_HEIGHT = 200;
const MAX_HEIGHT_RATIO = 0.9;
const DEFAULT_HEIGHT = 400;
const CHUNKS_PER_PAGE = 25;

/**
 * Bottom drawer component displaying all chunks for a selected document.
 * Resizable by dragging the top edge.
 */
export function DocumentChunksDrawer({
  docId,
  storeId,
  sourceUri,
  onClose,
}: DocumentChunksDrawerProps) {
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const resizeStartRef = useRef({ y: 0, startHeight: 0 });

  const totalPages = useMemo(
    () => Math.ceil(chunks.length / CHUNKS_PER_PAGE),
    [chunks.length],
  );

  const paginatedChunks = useMemo(() => {
    const startIndex = (currentPage - 1) * CHUNKS_PER_PAGE;
    const endIndex = startIndex + CHUNKS_PER_PAGE;
    return chunks.slice(startIndex, endIndex);
  }, [chunks, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [chunks.length]);

  const loadChunks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/vectorstore/documents/chunks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, storeId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to load chunks");
      }

      const data = await response.json();
      setChunks(data.chunks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [docId, storeId]);

  useEffect(() => {
    loadChunks();
  }, [loadChunks]);

  useLayoutEffect(() => {
    const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
    setHeight((current) => Math.min(current, maxHeight));
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
      setHeight((current) => {
        const clamped = Math.max(MIN_HEIGHT, Math.min(current, maxHeight));
        return clamped;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleResizeStart = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      setIsResizing(true);
      resizeStartRef.current = {
        y: event.clientY,
        startHeight: height,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [height],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const dy = resizeStartRef.current.y - event.clientY;
      const newHeight = resizeStartRef.current.startHeight + dy;
      const maxHeight = window.innerHeight * MAX_HEIGHT_RATIO;
      const clampedHeight = Math.max(
        MIN_HEIGHT,
        Math.min(newHeight, maxHeight),
      );
      setHeight(clampedHeight);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizing]);

  const formatMetadata = useCallback((metadata: Record<string, unknown>) => {
    return Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        let displayValue: string;
        if (Array.isArray(value)) {
          displayValue = value.join(" / ");
        } else if (typeof value === "object") {
          displayValue = JSON.stringify(value, null, 2);
        } else {
          displayValue = String(value);
        }
        return { key, value: displayValue };
      });
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-border bg-card shadow-lg"
        style={{ height: `${height}px` }}
      >
        <div
          className="flex cursor-ns-resize items-center justify-center border-b border-border bg-muted/30 px-4 py-2 transition-colors hover:bg-muted/50"
          onPointerDown={handleResizeStart}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize drawer"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground rotate-90" />
        </div>

        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold truncate">{sourceUri}</h2>
            <p className="text-xs text-muted-foreground">
              {chunks.length} chunk{chunks.length !== 1 ? "s" : ""}
              {totalPages > 1 && (
                <>
                  {" "}
                  • Page {currentPage} of {totalPages}
                </>
              )}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close drawer"
            className="h-8 w-8 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden min-h-0">
          <SimpleBar className="h-full">
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : chunks.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No chunks found for this document.
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedChunks.map((chunk, index) => {
                    const globalIndex =
                      (currentPage - 1) * CHUNKS_PER_PAGE + index;
                    const metadataEntries = formatMetadata(chunk.metadata);
                    const chunkIndex =
                      typeof chunk.metadata.chunk_index === "number"
                        ? chunk.metadata.chunk_index
                        : globalIndex;

                    return (
                      <div
                        key={chunk.id}
                        className="rounded-lg border border-border bg-background p-4"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-sm font-medium">
                            Chunk #{chunkIndex}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ID: {chunk.id}
                          </div>
                        </div>

                        <section className="mb-4" aria-label="Chunk value">
                          <div className="mb-1 text-xs font-medium text-muted-foreground">
                            Value
                          </div>
                          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                            <pre className="whitespace-pre-wrap break-words font-sans">
                              {chunk.text}
                            </pre>
                          </div>
                        </section>

                        {metadataEntries.length > 0 && (
                          <section aria-label="Chunk metadata">
                            <div className="mb-1 text-xs font-medium text-muted-foreground">
                              Metadata
                            </div>
                            <div className="rounded-md border border-border bg-muted/30 p-3">
                              <dl className="space-y-1 text-xs">
                                {metadataEntries.map(({ key, value }) => (
                                  <div key={key} className="flex gap-2">
                                    <dt className="font-medium text-muted-foreground shrink-0">
                                      {key}:
                                    </dt>
                                    <dd className="min-w-0 break-words">
                                      {value}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          </section>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SimpleBar>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 shrink-0">
            <div className="text-xs text-muted-foreground">
              Showing {paginatedChunks.length} of {chunks.length} chunks
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                aria-label="Next page"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
