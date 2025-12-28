"use client";

import { BarChart3, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import SimpleBar from "simplebar-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCost, formatNumber } from "@/lib/format";

type UsageTotalsNoUpdatedAt = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  upstreamCost: number;
};

type UsageSummaryResponse = {
  summary?: {
    total: UsageTotalsNoUpdatedAt;
    byModel: Record<string, UsageTotalsNoUpdatedAt>;
  };
  error?: string;
};

function normalizeTotals(
  input: Partial<UsageTotalsNoUpdatedAt> | null | undefined,
): UsageTotalsNoUpdatedAt {
  return {
    promptTokens: input?.promptTokens ?? 0,
    completionTokens: input?.completionTokens ?? 0,
    totalTokens: input?.totalTokens ?? 0,
    cost: input?.cost ?? 0,
    upstreamCost: input?.upstreamCost ?? 0,
  };
}

/**
 * Show lifetime usage totals (models, tokens, and cost).
 */
export function UsageStatsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [serverUsage, setServerUsage] = useState<UsageSummaryResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  /**
   * Fetch server-side usage aggregates (document processing, etc.).
   */
  const fetchServerUsage = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/usage/summary", { method: "GET" });
      const data = (await response.json()) as UsageSummaryResponse;
      setServerUsage(data);
    } catch (error) {
      setServerUsage({
        summary: { total: normalizeTotals(null), byModel: {} },
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear all lifetime stats from the server-side usage ledger.
   */
  const clearStats = useCallback(async () => {
    setIsClearing(true);
    try {
      const response = await fetch("/api/v1/usage/clear", { method: "POST" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to clear stats.");
      }
      await fetchServerUsage();
      setClearConfirmOpen(false);
    } catch (error) {
      setServerUsage((current) => ({
        ...(current ?? {
          summary: { total: normalizeTotals(null), byModel: {} },
        }),
        error: error instanceof Error ? error.message : "Unknown error",
      }));
    } finally {
      setIsClearing(false);
    }
  }, [fetchServerUsage]);

  useEffect(() => {
    if (!open) return;
    void fetchServerUsage();
  }, [fetchServerUsage, open]);

  const summary = serverUsage?.summary ?? null;

  const combinedRows = useMemo(() => {
    return Object.entries(summary?.byModel ?? {})
      .map(([modelId, totals]) => ({ modelId, totals }))
      .sort((a, b) => (b.totals.cost ?? 0) - (a.totals.cost ?? 0));
  }, [summary?.byModel]);

  const combinedTotal = useMemo(() => {
    return normalizeTotals(summary?.total);
  }, [summary?.total]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage stats
          </DialogTitle>
        </DialogHeader>

        <SimpleBar className="max-h-[70vh]" autoHide={false}>
          <div className="space-y-4 pr-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading.
              </div>
            ) : null}

            {serverUsage?.error ? (
              <div className="text-sm text-destructive">
                {serverUsage.error}
              </div>
            ) : null}

            {combinedRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">No data yet.</div>
            ) : (
              <div className="text-sm space-y-1">
                {combinedRows.map((row) => (
                  <div
                    key={row.modelId}
                    className="flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0 truncate">{row.modelId}</div>
                    <div className="shrink-0 text-muted-foreground">
                      {formatCost(row.totals.cost)} -{" "}
                      {formatNumber(row.totals.promptTokens)} in -{" "}
                      {formatNumber(row.totals.completionTokens)} out
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SimpleBar>

        <div className="mt-4 space-y-2">
          <div className="text-sm">
            Total: {formatCost(combinedTotal.cost)} -{" "}
            {formatNumber(combinedTotal.promptTokens)} in -{" "}
            {formatNumber(combinedTotal.completionTokens)} out
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setClearConfirmOpen(true)}
              disabled={isLoading || isClearing}
            >
              Clear stats
            </Button>
          </div>
        </div>
      </DialogContent>

      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear lifetime stats?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            This permanently clears all accumulated usage stats from the server.
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isClearing}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={clearStats}
              disabled={isClearing}
            >
              {isClearing ? "Clearing…" : "Clear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
