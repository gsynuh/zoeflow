"use client";

import { Play } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ZoeRagNodeData } from "@/zoeflow/types";

type RagTestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeData: ZoeRagNodeData;
};

type RagTestResult = {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  score: number;
  rank: number;
  citation: {
    source_uri: string;
    version: string;
    heading_path: string;
    start_char?: number;
    end_char?: number;
    doc_id: string;
    chunk_index?: number;
    content_type?: string;
  };
};

type RagTestResponse = {
  queries: string[];
  results: RagTestResult[];
};

/**
 * Dialog for testing RAG node queries and viewing results.
 */
export function RagTestDialog({
  open,
  onOpenChange,
  nodeData,
}: RagTestDialogProps) {
  const [queries, setQueries] = useState<string[]>([""]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<RagTestResponse | null>(null);

  const handleQueryChange = useCallback(
    (index: number, value: string) => {
      const next = [...queries];
      next[index] = value;
      setQueries(next);
      setError(null);
      setResponse(null);
    },
    [queries],
  );

  const handleAddQuery = useCallback(() => {
    if (queries.length >= nodeData.maxQueries) return;
    setQueries([...queries, ""]);
  }, [queries, nodeData.maxQueries]);

  const handleRemoveQuery = useCallback(
    (index: number) => {
      if (queries.length <= 1) return;
      const next = queries.filter((_, i) => i !== index);
      setQueries(next);
    },
    [queries],
  );

  const handleRunTest = useCallback(async () => {
    const trimmedQueries = queries
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    if (trimmedQueries.length === 0) {
      setError("Please enter at least one query.");
      return;
    }

    if (trimmedQueries.length > nodeData.maxQueries) {
      setError(
        `Maximum ${nodeData.maxQueries} queries allowed (configured maxQueries).`,
      );
      return;
    }

    setIsRunning(true);
    setError(null);
    setResponse(null);

    try {
      const storeId = nodeData.storeId || "default";
      const model = nodeData.embeddingModel?.trim() || undefined;
      const topK = nodeData.topK ?? 5;
      const minScore =
        typeof nodeData.minScore === "number" &&
        Number.isFinite(nodeData.minScore)
          ? Math.max(0, Math.min(1, nodeData.minScore))
          : 0.6;

      const apiResponse = await fetch("/api/v1/vectorstore/query-many", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          queries: trimmedQueries,
          model: model || undefined,
          topK: Math.min(5, Math.max(1, topK)),
        }),
      });

      if (!apiResponse.ok) {
        const body = await apiResponse.text();
        throw new Error(
          `RAG search failed (${apiResponse.status}): ${body || "Unknown error"}`,
        );
      }

      const data = (await apiResponse.json()) as {
        queries?: string[];
        results?: Array<{
          id: string;
          text: string;
          metadata?: Record<string, unknown>;
          score: number; // RRF score for ranking
          similarityScore?: number; // Original similarity score for filtering
        }>;
      };

      const rawResults = Array.isArray(data.results) ? data.results : [];
      const formattedQueries = Array.isArray(data.queries)
        ? data.queries
        : trimmedQueries;

      // Filter by similarityScore if available (RRF results), otherwise fall back to score
      const filteredResults = rawResults.filter((result) => {
        const scoreToCheck =
          typeof result.similarityScore === "number"
            ? result.similarityScore
            : result.score;
        return typeof scoreToCheck === "number" && scoreToCheck >= minScore;
      });

      // Format results with citations (matching the RAG tool execution format)
      const resultsWithCitations: RagTestResult[] = filteredResults.map(
        (result, index) => {
          const metadata = result.metadata ?? {};
          const headingPath = Array.isArray(metadata.heading_path)
            ? metadata.heading_path.join(" / ")
            : typeof metadata.heading_path === "string"
              ? metadata.heading_path
              : "";

          const citation = {
            source_uri:
              typeof metadata.source_uri === "string"
                ? metadata.source_uri
                : "",
            version:
              typeof metadata.version === "string" ? metadata.version : "",
            heading_path: headingPath,
            start_char:
              typeof metadata.start_char === "number"
                ? metadata.start_char
                : undefined,
            end_char:
              typeof metadata.end_char === "number"
                ? metadata.end_char
                : undefined,
            doc_id: typeof metadata.doc_id === "string" ? metadata.doc_id : "",
            chunk_index:
              typeof metadata.chunk_index === "number"
                ? metadata.chunk_index
                : undefined,
            content_type:
              typeof metadata.content_type === "string"
                ? metadata.content_type
                : undefined,
          };

          return {
            ...result,
            rank: index + 1,
            citation,
          };
        },
      );

      setResponse({
        queries: formattedQueries,
        results: resultsWithCitations,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsRunning(false);
    }
  }, [queries, nodeData]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Reset state when closing
    setTimeout(() => {
      setQueries([""]);
      setError(null);
      setResponse(null);
    }, 200);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-4xl h-[90vh] flex flex-col"
        aria-label="RAG Test"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Test RAG Node</DialogTitle>
          <DialogDescription>
            Test queries using the current node configuration. Results will show
            the data that would be exported by the RAG node execution.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden pr-1">
          {/* Node Configuration Summary */}
          <section
            className="rounded-md border bg-muted/30 p-3 text-sm flex-shrink-0"
            aria-label="Node configuration"
          >
            <div className="font-medium mb-2">Node Configuration</div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div>
                <span className="font-medium">Store ID:</span>{" "}
                {nodeData.storeId || "default"}
              </div>
              <div>
                <span className="font-medium">Top K:</span> {nodeData.topK ?? 5}
              </div>
              <div>
                <span className="font-medium">Max Queries:</span>{" "}
                {nodeData.maxQueries ?? 6}
              </div>
              <div>
                <span className="font-medium">Embedding Model:</span>{" "}
                {nodeData.embeddingModel || "default"}
              </div>
              <div>
                <span className="font-medium">Min Score:</span>{" "}
                {typeof nodeData.minScore === "number"
                  ? nodeData.minScore.toFixed(2)
                  : "0.60"}
              </div>
            </div>
          </section>

          {/* Query Input */}
          <section
            className="flex flex-col gap-2 flex-shrink-0"
            aria-label="Queries"
          >
            <div className="flex items-center justify-between">
              <Label>Queries</Label>
              {queries.length < nodeData.maxQueries && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddQuery}
                >
                  Add Query
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {queries.map((query, index) => (
                <div key={index} className="flex gap-2">
                  <Textarea
                    value={query}
                    onChange={(e) => handleQueryChange(index, e.target.value)}
                    placeholder={`Query ${index + 1}...`}
                    className="min-h-16 flex-1"
                    disabled={isRunning}
                  />
                  {queries.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveQuery(index)}
                      disabled={isRunning}
                      aria-label={`Remove query ${index + 1}`}
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex-shrink-0">
              {error}
            </div>
          )}

          {/* Results */}
          {response && (
            <section
              className="flex flex-col gap-2 flex-1 min-h-0"
              aria-label="Results"
            >
              <div className="text-sm font-medium flex-shrink-0">
                Results ({response.results.length} found)
              </div>
              <SimpleBar className="flex-1 min-h-0 border rounded-md">
                {response.results.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    No results found.
                  </div>
                ) : (
                  <div className="divide-y">
                    {response.results.map((result) => (
                      <div
                        key={result.id}
                        className="p-4 bg-background hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            Rank #{result.rank} • Score:{" "}
                            {result.score.toFixed(4)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ID: {result.id}
                          </div>
                        </div>
                        <div className="text-sm mb-2 wrap-break-word">
                          {result.text}
                        </div>
                        {result.citation && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            {result.citation.source_uri && (
                              <div>
                                <span className="font-medium">Source:</span>{" "}
                                {result.citation.source_uri}
                              </div>
                            )}
                            {result.citation.heading_path && (
                              <div>
                                <span className="font-medium">Path:</span>{" "}
                                {result.citation.heading_path}
                              </div>
                            )}
                            {result.citation.doc_id && (
                              <div>
                                <span className="font-medium">Doc ID:</span>{" "}
                                {result.citation.doc_id}
                              </div>
                            )}
                            {result.citation.chunk_index !== undefined && (
                              <div>
                                <span className="font-medium">Chunk:</span>{" "}
                                {result.citation.chunk_index}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </SimpleBar>
            </section>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            type="button"
            onClick={handleRunTest}
            disabled={isRunning || queries.every((q) => !q.trim())}
          >
            <Play className="h-4 w-4" />
            {isRunning ? "Running..." : "Run Test"}
          </Button>
          <Button type="button" variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
