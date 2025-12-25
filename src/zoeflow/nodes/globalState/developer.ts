import type { ZoeDeveloperToolDefinition } from "@/zoeflow/nodes/tool/types";
import { ZoeNodeID } from "@/zoeflow/types";

/**
 * Global State tool definition.
 */
export const GLOBAL_STATE_TOOL: ZoeDeveloperToolDefinition = {
  key: ZoeNodeID.GlobalState,
  label: "Global State",
  description: "Set or get global variables using dot-notation paths.",
  openRouterTool: {
    type: "function",
    function: {
      name: "global_state",
      description:
        "Set or get a global variable value using a dot-notation path (e.g., 'world.user.name').",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["set", "get"],
            description:
              "Action to perform: 'set' to set a value, 'get' to retrieve a value.",
          },
          path: {
            type: "string",
            description:
              "Dot-notation path to the variable (e.g., 'world.user.name').",
          },
          value: {
            description:
              "Value to set (required for 'set' action, ignored for 'get' action).",
          },
        },
        required: ["action", "path"],
      },
    },
  },
  execute: async (input) => {
    const { toolCall } = input;
    const args = toolCall.arguments as {
      action?: string;
      path?: string;
      value?: unknown;
    };

    if (
      !args ||
      typeof args.action !== "string" ||
      typeof args.path !== "string"
    ) {
      return {
        message: "Error: 'action' and 'path' are required parameters.",
        value: { error: "Missing required parameters" },
      };
    }

    const { action, path, value } = args;

    if (action !== "set" && action !== "get") {
      return {
        message: `Error: Invalid action "${action}". Must be 'set' or 'get'.`,
        value: { error: "Invalid action" },
      };
    }

    // This tool is handled specially in completion execution
    // Return a placeholder - actual execution happens in completion/execute.ts
    return {
      message: "Global State tool execution handled in completion",
      value: { action, path, value },
    };
  },
};
