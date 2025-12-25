import { evaluateExpression } from "@/zoeflow/engine/expression";
import type {
  ZoeNodeExecutionContext,
  ZoeNodeExecutionResult,
} from "@/zoeflow/engine/types";
import { getNodeTitle } from "@/zoeflow/nodes/shared/title";
import { getSwitchCaseLabels } from "@/zoeflow/nodes/switch/definition";
import type { ZoeSwitchNodeData } from "@/zoeflow/types";

/**
 * Execute the Switch node.
 *
 * @param context - Execution context for the node.
 * @param data - Switch node data.
 */
export async function executeSwitchNode(
  context: ZoeNodeExecutionContext,
  data: ZoeSwitchNodeData,
): Promise<ZoeNodeExecutionResult> {
  context.runtime.callbacks.onTrace(`Executing: ${getNodeTitle(context.node)}`);

  const totalCases = clampToRange(data.cases, 2, 8, 3);
  const caseLabels = getSwitchCaseLabels(data);
  const result = evaluateExpression<unknown>(
    data.expression ?? "",
    context.scope,
  );
  if (result.error) {
    throw new Error(
      `Switch expression failed (${context.node.id}): ${result.error}`,
    );
  }
  const chosenPort = resolveSwitchPort(result.value, totalCases, caseLabels);
  return { nextPort: chosenPort };
}

/**
 * Resolve which switch port to follow from an evaluated selector result.
 *
 * @param value - Evaluated expression value.
 * @param totalCases - Number of cases available.
 * @param caseLabels - Case labels for string matching.
 */
function resolveSwitchPort(
  value: unknown,
  totalCases: number,
  caseLabels: string[],
) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("Switch expression returned an empty string.");
    }
    const matchIndex = caseLabels.findIndex(
      (label) => label.toLowerCase() === trimmed.toLowerCase(),
    );
    if (matchIndex >= 0) {
      return `case-${matchIndex}`;
    }
    if (/^case-\d+$/.test(trimmed)) return trimmed;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return `case-${clampToRange(Math.floor(numeric), 0, totalCases - 1, 0)}`;
    }
    throw new Error(
      `Switch expression returned an unrecognized case label: "${trimmed}".`,
    );
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `case-${clampToRange(Math.floor(value), 0, totalCases - 1, 0)}`;
  }

  throw new Error("Switch expression must return a string or number.");
}

/**
 * Clamp a number into an inclusive range, using a fallback when invalid.
 *
 * @param value - Incoming value.
 * @param min - Min range bound.
 * @param max - Max range bound.
 * @param fallback - Fallback when the value is invalid.
 */
function clampToRange(
  value: number,
  min: number,
  max: number,
  fallback: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
