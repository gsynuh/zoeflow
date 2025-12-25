import type { ZoeExecutionState } from "@/zoeflow/engine/types";
import {
  getNestedValue,
  setNestedValue,
} from "@/zoeflow/nodes/globalState/utils";
import type { ContextMessageEntry } from "@/zoeflow/openrouter/context";

export type ZoeExpressionScope = {
  input: unknown;
  /**
   * Messages created by Message nodes (deprecated alias for `contextMessages`).
   */
  messages: ContextMessageEntry[];
  /**
   * Messages created by Message nodes (system/user) injected into completions.
   */
  contextMessages: ContextMessageEntry[];
  vars: Record<string, unknown>;
};

/**
 * Evaluate a JavaScript expression against a restricted scope object.
 */
export function evaluateExpression<T = unknown>(
  expression: string,
  scope: ZoeExpressionScope,
): { value: T | null; error: string | null } {
  const trimmed = expression.trim();
  if (!trimmed) {
    return { value: null, error: "Expression is empty." };
  }

  try {
    const fn = new Function(
      "scope",
      `"use strict"; const { input, messages, contextMessages, vars } = scope; return (${trimmed});`,
    ) as (scope: ZoeExpressionScope) => T;
    return { value: fn(scope), error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown expression error.";
    return { value: null, error: message };
  }
}

/**
 * Evaluate a template literal string using the same scope as expressions.
 */
export function evaluateTemplate(
  template: string,
  scope: ZoeExpressionScope,
): { value: string | null; error: string | null } {
  const trimmed = template.trim();
  if (!trimmed) {
    return { value: "", error: null };
  }

  try {
    const escaped = template.replace(/`/g, "\\`");
    const fn = new Function(
      "scope",
      `"use strict"; const { input, messages, contextMessages, vars } = scope; return \`${escaped}\`;`,
    ) as (scope: ZoeExpressionScope) => string;
    return { value: fn(scope), error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown template error.";
    return { value: null, error: message };
  }
}

export type ZoeFunctionBodyOptions = {
  state?: ZoeExecutionState;
  log?: (...args: unknown[]) => void;
};

/**
 * Evaluate a JavaScript function body against a restricted scope object.
 */
export function evaluateFunctionBody<T = unknown>(
  body: string,
  scope: ZoeExpressionScope,
  options: ZoeFunctionBodyOptions = {},
): { value: T | null; error: string | null } {
  const trimmed = body.trim();
  if (!trimmed) {
    return { value: null, error: "Function body is empty." };
  }

  try {
    // Create helper functions for variable management
    const setVar = (path: string, value: unknown) => {
      if (!options.state) {
        throw new Error("setVar requires state to be available");
      }
      setNestedValue(options.state.vars, path, value);
    };

    const getVar = (path: string): unknown => {
      if (!options.state) {
        throw new Error("getVar requires state to be available");
      }
      return getNestedValue(options.state.vars, path);
    };

    const fn = new Function(
      "scope",
      "state",
      "log",
      "setVar",
      "getVar",
      `"use strict"; const { input, messages, contextMessages, vars } = scope; { ${trimmed} }`,
    ) as (
      scope: ZoeExpressionScope,
      state: ZoeExecutionState,
      log: (...args: unknown[]) => void,
      setVar: (path: string, value: unknown) => void,
      getVar: (path: string) => unknown,
    ) => T;
    return {
      value: fn(
        scope,
        options.state as ZoeExecutionState,
        options.log ?? (() => undefined),
        setVar,
        getVar,
      ),
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown function body error.";
    return { value: null, error: message };
  }
}
