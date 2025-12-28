import { promises as fs } from "node:fs";
import path from "node:path";

import type { UsageEvent, UsageSummary, UsageTotals } from "./types";

type UsageLedgerFile = {
  version: 1;
  createdAt: number;
  updatedAt: number;
  summary: UsageSummary;
  events: UsageEvent[];
};

const LEDGER_DIR = path.join(process.cwd(), "content", "_usage");
const LEDGER_FILE = path.join(LEDGER_DIR, "usage-ledger.json");
const MAX_EVENTS = 20_000;
let writeChain: Promise<void> = Promise.resolve();

function getEmptyTotals(): UsageTotals {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cost: 0,
    upstreamCost: 0,
  };
}

function getEmptySummary(): UsageSummary {
  return { total: getEmptyTotals(), byModel: {} };
}

/**
 * Read the usage ledger from disk, returning an empty structure if none exists yet.
 */
export async function readUsageLedger(): Promise<UsageLedgerFile> {
  try {
    const content = await fs.readFile(LEDGER_FILE, "utf8");
    const parsed = JSON.parse(content) as UsageLedgerFile;
    if (!parsed || typeof parsed !== "object") {
      return {
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        summary: getEmptySummary(),
        events: [],
      };
    }
    return {
      version: 1,
      createdAt:
        typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      updatedAt:
        typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
      summary: parsed.summary ?? getEmptySummary(),
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return {
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        summary: getEmptySummary(),
        events: [],
      };
    }
    throw error;
  }
}

/**
 * Write the usage ledger to disk.
 *
 * @param ledger - Ledger content to persist.
 */
export async function writeUsageLedger(ledger: UsageLedgerFile): Promise<void> {
  await fs.mkdir(LEDGER_DIR, { recursive: true });
  await fs.writeFile(LEDGER_FILE, JSON.stringify(ledger, null, 2), "utf8");
}

/**
 * Append a usage event and update aggregate totals.
 *
 * Only intended for events that include cost data (cost can be 0 but must be provided).
 *
 * @param event - Usage event to record.
 */
export async function recordUsageEvent(event: UsageEvent): Promise<void> {
  writeChain = writeChain.then(() => recordUsageEventInternal(event));
  return writeChain;
}

/**
 * Clear the usage ledger, resetting totals and removing event history.
 */
export async function clearUsageLedger(): Promise<void> {
  writeChain = writeChain.then(async () => {
    await writeUsageLedger({
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      summary: getEmptySummary(),
      events: [],
    });
  });
  return writeChain;
}

async function recordUsageEventInternal(event: UsageEvent): Promise<void> {
  const normalizedModel = event.model.trim();
  if (!normalizedModel) return;
  if (!Number.isFinite(event.cost)) return;

  const ledger = await readUsageLedger();
  const nextEvents = [...ledger.events, event].slice(-MAX_EVENTS);
  const currentSummary = ledger.summary ?? getEmptySummary();
  const byModel = { ...(currentSummary.byModel ?? {}) };
  const previousModelTotals = byModel[normalizedModel] ?? getEmptyTotals();

  const upstreamCost = event.upstreamCost ?? 0;
  byModel[normalizedModel] = {
    promptTokens: previousModelTotals.promptTokens + (event.promptTokens ?? 0),
    completionTokens:
      previousModelTotals.completionTokens + (event.completionTokens ?? 0),
    totalTokens: previousModelTotals.totalTokens + (event.totalTokens ?? 0),
    cost: previousModelTotals.cost + (event.cost ?? 0),
    upstreamCost: previousModelTotals.upstreamCost + upstreamCost,
  };

  const previousTotal = currentSummary.total ?? getEmptyTotals();
  const nextTotal: UsageTotals = {
    promptTokens: previousTotal.promptTokens + (event.promptTokens ?? 0),
    completionTokens:
      previousTotal.completionTokens + (event.completionTokens ?? 0),
    totalTokens: previousTotal.totalTokens + (event.totalTokens ?? 0),
    cost: previousTotal.cost + (event.cost ?? 0),
    upstreamCost: previousTotal.upstreamCost + upstreamCost,
  };

  await writeUsageLedger({
    version: 1,
    createdAt: ledger.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    summary: { total: nextTotal, byModel },
    events: nextEvents,
  });
}
