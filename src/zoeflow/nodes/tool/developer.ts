import { COIN_FLIP_TOOL } from "@/zoeflow/nodes/coinFlip/developer";
import { DICE_ROLL_TOOL } from "@/zoeflow/nodes/diceRoll/developer";
import { GLOBAL_STATE_TOOL } from "@/zoeflow/nodes/globalState/developer";
import { RAG_SEARCH_TOOL } from "@/zoeflow/nodes/rag/developer";
import { READ_DOCUMENT_TOOL } from "@/zoeflow/nodes/readDocument/developer";
import { ZoeNodeID, type ZoeToolNodeID } from "@/zoeflow/types";

import type { ZoeDeveloperToolDefinition } from "./types";

export type {
  ZoeDeveloperToolDefinition,
  ZoeDeveloperToolExecuteInput,
  ZoeDeveloperToolExecutionResult,
} from "./types";

const TOOL_DEFINITIONS: Record<ZoeToolNodeID, ZoeDeveloperToolDefinition> = {
  [ZoeNodeID.CoinFlip]: COIN_FLIP_TOOL,
  [ZoeNodeID.DiceRoll]: DICE_ROLL_TOOL,
  [ZoeNodeID.Rag]: RAG_SEARCH_TOOL,
  [ZoeNodeID.ReadDocument]: READ_DOCUMENT_TOOL,
  [ZoeNodeID.GlobalState]: GLOBAL_STATE_TOOL,
};

/**
 * Get a developer tool definition by node ID.
 *
 * @param key - Tool node ID.
 */
export function getDeveloperToolDefinition(
  key: ZoeToolNodeID,
): ZoeDeveloperToolDefinition {
  return TOOL_DEFINITIONS[key];
}

/**
 * Safely resolve a developer tool definition from untrusted input.
 *
 * @param value - Untrusted tool node ID value.
 */
export function tryGetDeveloperToolDefinition(value: unknown) {
  if (typeof value !== "string") return null;
  const definition = (
    TOOL_DEFINITIONS as Record<string, ZoeDeveloperToolDefinition>
  )[value];
  return definition ?? null;
}

/**
 * List all developer tool definitions registered with the Tool node.
 */
export function listDeveloperToolDefinitions() {
  return Object.values(TOOL_DEFINITIONS);
}
