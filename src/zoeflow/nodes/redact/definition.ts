import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  ZoeRedactionPlaceholderFormat,
  type ZoeNodeDefinition,
  type ZoeRedactNodeData,
} from "@/zoeflow/types";

import { REDACT_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the Redact node.
 */
export function createRedactNodeData(): ZoeRedactNodeData {
  return {
    type: ZoeNodeID.Redact,
    title: "Redact",
    label: "",
    redactEmails: REDACT_DEFAULTS.redactEmails,
    redactApiKeys: REDACT_DEFAULTS.redactApiKeys,
    redactSdkKeys: REDACT_DEFAULTS.redactSdkKeys,
    placeholderFormat: REDACT_DEFAULTS.placeholderFormat,
    replacement: REDACT_DEFAULTS.replacement,
  };
}

export const redactNodeDefinition: ZoeNodeDefinition<ZoeRedactNodeData> = {
  type: ZoeNodeID.Redact,
  label: "Redact",
  description: "Redact sensitive data from the input payload.",
  category: ZoeNodeCategory.Function,
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
      key: "redactEmails",
      label: "Redact emails",
      kind: ZoeAttributeKind.Toggle,
      description: "Replace email addresses found in the input.",
    },
    {
      key: "redactApiKeys",
      label: "Redact API keys",
      kind: ZoeAttributeKind.Toggle,
      description: "Replace common API key/token patterns found in the input.",
    },
    {
      key: "redactSdkKeys",
      label: "Redact SDK keys",
      kind: ZoeAttributeKind.Toggle,
      description: "Replace values assigned to sdkKey/sdk_key-like labels.",
    },
    {
      key: "placeholderFormat",
      label: "Placeholder format",
      kind: ZoeAttributeKind.Select,
      description:
        "Typed preserves token shape (prefix/length). Generic replaces the entire match with a single string.",
      options: [
        {
          label: "Typed ([REDACTED_EMAIL], ...)",
          value: ZoeRedactionPlaceholderFormat.Typed,
        },
        {
          label: "Generic ([REDACTED])",
          value: ZoeRedactionPlaceholderFormat.Generic,
        },
      ],
    },
    {
      key: "replacement",
      label: "Generic replacement",
      kind: ZoeAttributeKind.Text,
      description: "Replacement used when Placeholder format is Generic.",
      placeholder: "[REDACTED]",
      exposed: (data) =>
        data.placeholderFormat === ZoeRedactionPlaceholderFormat.Generic,
    },
  ],
  inputPorts: [
    {
      id: "in",
      label: "In",
      direction: ZoePortDirection.Input,
    },
  ],
  outputPorts: [
    {
      id: "out",
      label: "Out",
      direction: ZoePortDirection.Output,
    },
  ],
  createData: createRedactNodeData,
};
