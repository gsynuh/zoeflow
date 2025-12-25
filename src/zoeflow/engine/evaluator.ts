import { evaluateFunctionBody } from "@/zoeflow/engine/expression";
import type { ZoeExecutionState } from "@/zoeflow/engine/types";
import { getNestedValue } from "@/zoeflow/nodes/globalState/utils";
import {
  ZoeNodeID,
  type ZoeEdge,
  type ZoeGetVariableNodeData,
  type ZoeNode,
  type ZoeTransformNodeData,
} from "@/zoeflow/types";

export type ZoeEvaluationCacheEntry = {
  key: string;
  value: unknown;
};

export enum ZoeEvaluationCacheKind {
  GetVariable = "get-variable",
  Transform = "transform",
}

export type ZoeEvaluationContext = {
  state: ZoeExecutionState;
  nodesById: Map<string, ZoeNode>;
  edgesByTarget: Map<string, ZoeEdge[]>;
  cache: Map<string, ZoeEvaluationCacheEntry>;
  varsCacheKey?: string;
};

export type CreateEvaluationContextOptions = {
  state: ZoeExecutionState;
  nodesById: Map<string, ZoeNode>;
  edgesByTarget: Map<string, ZoeEdge[]>;
  cache?: Map<string, ZoeEvaluationCacheEntry>;
};

/**
 * Create a shared evaluation context for resolving dataflow outputs.
 *
 * @param options - Evaluation context options.
 */
export function createEvaluationContext(
  options: CreateEvaluationContextOptions,
): ZoeEvaluationContext {
  return {
    state: options.state,
    nodesById: options.nodesById,
    edgesByTarget: options.edgesByTarget,
    cache: options.cache ?? new Map<string, ZoeEvaluationCacheEntry>(),
  };
}

/**
 * Clear cached evaluation results to reflect updated graph or vars state.
 *
 * @param context - Evaluation context to invalidate.
 */
export function invalidateEvaluationCache(context: ZoeEvaluationContext) {
  context.cache.clear();
  context.varsCacheKey = undefined;
}

/**
 * Evaluate a node output by walking upstream data dependencies.
 *
 * @param nodeId - Node id to evaluate.
 * @param context - Evaluation context.
 */
export function evaluateNodeOutput(
  nodeId: string,
  context: ZoeEvaluationContext,
): unknown | null {
  return evaluateNodeOutputInternal(nodeId, context, new Set<string>());
}

const PURE_EVALUATION_NODE_TYPES = new Set<ZoeNodeID>([
  ZoeNodeID.GetVariable,
  ZoeNodeID.Transform,
]);

/**
 * Resolve a node output using memoized evaluation and cycle detection.
 *
 * @param nodeId - Node id to resolve.
 * @param context - Evaluation context.
 * @param visited - Node ids already visited to avoid cycles.
 */
function evaluateNodeOutputInternal(
  nodeId: string,
  context: ZoeEvaluationContext,
  visited: Set<string>,
): unknown | null {
  if (visited.has(nodeId)) return null;
  visited.add(nodeId);

  const node = context.nodesById.get(nodeId);
  if (!node) return null;

  if (!PURE_EVALUATION_NODE_TYPES.has(node.type)) {
    return context.state.nodeOutputs.get(nodeId) ?? null;
  }

  if (node.type === ZoeNodeID.GetVariable) {
    return evaluateGetVariableOutput(node, context, visited);
  }

  if (node.type === ZoeNodeID.Transform) {
    return evaluateTransformOutput(node, context, visited);
  }

  return null;
}

/**
 * Evaluate a Get Variable node output with caching.
 *
 * @param node - Node instance to evaluate.
 * @param context - Evaluation context.
 * @param visited - Node ids already visited to avoid cycles.
 */
function evaluateGetVariableOutput(
  node: ZoeNode,
  context: ZoeEvaluationContext,
  visited: Set<string>,
): unknown | null {
  const data = node.data as ZoeGetVariableNodeData;
  const pathInput = resolveInputPortValue(node.id, "path", context, visited);
  const path =
    typeof pathInput === "string"
      ? pathInput.trim()
      : (data.path?.trim() ?? "");
  if (!path) return null;

  const cacheKey = buildCacheKey(node.id, {
    type: ZoeEvaluationCacheKind.GetVariable,
    path,
    varsKey: getVarsCacheKey(context),
  });
  const cached = context.cache.get(node.id);
  if (cached && cached.key === cacheKey) {
    return cached.value ?? null;
  }

  const value = getNestedValue(context.state.vars, path);
  const normalized = value ?? null;
  context.cache.set(node.id, { key: cacheKey, value: normalized });
  return normalized;
}

/**
 * Evaluate a Transform node output with caching and isolated vars.
 *
 * @param node - Node instance to evaluate.
 * @param context - Evaluation context.
 * @param visited - Node ids already visited to avoid cycles.
 */
function evaluateTransformOutput(
  node: ZoeNode,
  context: ZoeEvaluationContext,
  visited: Set<string>,
): unknown | null {
  const inputValue = resolveInputPortValue(node.id, "in", context, visited);
  if (inputValue === null) return null;

  const data = node.data as ZoeTransformNodeData;
  const varsSnapshot = cloneVarsForEvaluation(context.state.vars);
  const cacheKey = buildCacheKey(node.id, {
    type: ZoeEvaluationCacheKind.Transform,
    expression: data.expression ?? "",
    input: inputValue,
    varsKey: getVarsCacheKey(context),
  });
  const cached = context.cache.get(node.id);
  if (cached && cached.key === cacheKey) {
    return cached.value ?? null;
  }

  const result = evaluateFunctionBody(
    data.expression ?? "",
    {
      input: inputValue,
      messages: [],
      contextMessages: [],
      vars: varsSnapshot,
    },
    {
      state: {
        ...context.state,
        vars: varsSnapshot,
      },
    },
  );
  const normalized = result.error ? null : (result.value ?? null);
  context.cache.set(node.id, { key: cacheKey, value: normalized });
  return normalized;
}

/**
 * Resolve a connected input port value via upstream evaluation.
 *
 * @param nodeId - Target node id.
 * @param portId - Input port id.
 * @param context - Evaluation context.
 * @param visited - Node ids already visited to avoid cycles.
 */
function resolveInputPortValue(
  nodeId: string,
  portId: string,
  context: ZoeEvaluationContext,
  visited: Set<string>,
): unknown | null {
  const incoming = context.edgesByTarget.get(nodeId) ?? [];
  const edge = incoming.find((item) => item.targetPort === portId);
  if (!edge) return null;
  return evaluateNodeOutputInternal(edge.source, context, visited);
}

/**
 * Build a stable cache key for a node output.
 *
 * @param nodeId - Node id being cached.
 * @param payload - Cache payload to serialize.
 */
function buildCacheKey(
  nodeId: string,
  payload: Record<string, unknown>,
): string {
  return `${nodeId}:${stringifyCacheValue(payload)}`;
}

/**
 * Create a cached serialization of the current vars state.
 *
 * @param context - Evaluation context.
 */
function getVarsCacheKey(context: ZoeEvaluationContext): string {
  if (context.varsCacheKey) return context.varsCacheKey;
  const key = stringifyCacheValue(context.state.vars);
  context.varsCacheKey = key;
  return key;
}

/**
 * Safely serialize values for cache keys.
 *
 * @param value - Value to serialize.
 */
function stringifyCacheValue(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, next) => {
      if (typeof next === "object" && next !== null) {
        if (seen.has(next)) return "[Circular]";
        seen.add(next);
      }
      return next;
    });
  } catch {
    return String(value);
  }
}

/**
 * Clone vars for evaluation to avoid mutating runtime state.
 *
 * @param vars - Vars object to clone.
 */
function cloneVarsForEvaluation(
  vars: Record<string, unknown>,
): Record<string, unknown> {
  try {
    return structuredClone(vars);
  } catch {
    try {
      return JSON.parse(JSON.stringify(vars)) as Record<string, unknown>;
    } catch {
      return { ...vars };
    }
  }
}
