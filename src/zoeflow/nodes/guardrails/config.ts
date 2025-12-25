/**
 * Internal configuration for the Guardrails node.
 *
 * This node is developer-controlled: end users can toggle guardrail modules, but cannot
 * change model/temperature from the UI.
 */
export const GUARDRAILS_MODEL = "openai/gpt-4o-mini";

/**
 * Fixed sampling temperature for the guardrails check.
 */
export const GUARDRAILS_TEMPERATURE = 0;
