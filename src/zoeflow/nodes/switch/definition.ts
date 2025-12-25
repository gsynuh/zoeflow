import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeNodeDefinition,
  type ZoePortDefinition,
  type ZoeSwitchNodeData,
} from "@/zoeflow/types";

import { SWITCH_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Clamp switch case counts into a supported range.
 */
export function clampSwitchCases(value: number) {
  if (!Number.isFinite(value)) return SWITCH_DEFAULTS.cases;
  return Math.max(
    SWITCH_DEFAULTS.minCases,
    Math.min(SWITCH_DEFAULTS.maxCases, Math.round(value)),
  );
}

/**
 * Create default data for the Switch node.
 */
export function createSwitchNodeData(): ZoeSwitchNodeData {
  return {
    type: ZoeNodeID.Switch,
    title: "Switch",
    label: "",
    expression: SWITCH_DEFAULTS.expression,
    cases: SWITCH_DEFAULTS.cases,
    caseLabels: SWITCH_DEFAULTS.caseLabels,
  };
}

/**
 * Parse case labels for a switch node.
 *
 * @param data - Switch node data.
 */
export function getSwitchCaseLabels(data: ZoeSwitchNodeData): string[] {
  const total = clampSwitchCases(data.cases);
  const labels = (data.caseLabels ?? "")
    .split("\n")
    .map((label) => label.trim())
    .filter(Boolean);

  return Array.from({ length: total }).map(
    (_, index) => labels[index] ?? `Case ${index + 1}`,
  );
}

/**
 * Build output port definitions for the switch node.
 */
export function getSwitchOutputPorts(
  data: ZoeSwitchNodeData,
): ZoePortDefinition[] {
  const labels = getSwitchCaseLabels(data);
  return labels.map((label, index) => ({
    id: `case-${index}`,
    label,
    direction: ZoePortDirection.Output,
  }));
}

export const switchNodeDefinition: ZoeNodeDefinition<ZoeSwitchNodeData> = {
  type: ZoeNodeID.Switch,
  label: "Switch",
  description: "Route to multiple outputs based on a selector expression.",
  category: ZoeNodeCategory.Control,
  allowUserCreate: true,
  requiredCount: null,
  attributes: [
    {
      key: "label",
      label: "Label",
      kind: ZoeAttributeKind.Text,
      description: "Optional label for this node.",
      placeholder: "",
    },
    {
      key: "expression",
      label: "Expression",
      kind: ZoeAttributeKind.Expression,
      description: "Expression whose result decides the output case.",
      placeholder: "input.category",
    },
    {
      key: "cases",
      label: "Cases",
      kind: ZoeAttributeKind.Number,
      description: "Number of output cases.",
      min: SWITCH_DEFAULTS.minCases,
      max: SWITCH_DEFAULTS.maxCases,
    },
    {
      key: "caseLabels",
      label: "Case labels",
      kind: ZoeAttributeKind.Text,
      description: "Optional labels, one per line (top to bottom).",
      placeholder: "Case 1\nCase 2\nCase 3",
      multiline: true,
    },
  ],
  inputPorts: [
    {
      id: "in",
      label: "In",
      direction: ZoePortDirection.Input,
    },
  ],
  outputPorts: getSwitchOutputPorts,
  createData: createSwitchNodeData,
};
