import type { ZoeDeveloperToolDefinition } from "@/zoeflow/nodes/tool/types";
import { ZoeNodeID } from "@/zoeflow/types";

/**
 * Dice Roll tool definition.
 */
export const DICE_ROLL_TOOL: ZoeDeveloperToolDefinition = {
  key: ZoeNodeID.DiceRoll,
  label: "Dice roll",
  description: "Rolls dice with specified number of faces.",
  openRouterTool: {
    type: "function",
    function: {
      name: "dice_roll",
      description:
        "Roll one or more dice with a specified number of faces. For example, '4d21' means roll 4 dice with 21 faces each.",
      parameters: {
        type: "object",
        properties: {
          die_count: {
            type: "integer",
            description: "Number of dice to roll (e.g., 4 for '4d21').",
            minimum: 1,
          },
          faces: {
            type: "integer",
            description:
              "Number of faces on each die (e.g., 21 for '4d21'). Must be at least 2.",
            minimum: 2,
          },
        },
        required: ["die_count", "faces"],
      },
    },
  },
  execute: async (input) => {
    const args = input.toolCall.arguments as
      | { die_count?: number; faces?: number }
      | null
      | undefined;
    const dieCount = args?.die_count;
    const faces = args?.faces;

    if (
      typeof dieCount !== "number" ||
      dieCount < 1 ||
      !Number.isInteger(dieCount)
    ) {
      throw new Error(
        `Invalid die_count: ${dieCount}. Must be a positive integer.`,
      );
    }

    if (typeof faces !== "number" || faces < 2 || !Number.isInteger(faces)) {
      throw new Error(`Invalid faces: ${faces}. Must be an integer >= 2.`);
    }

    const rolls: number[] = [];
    let total = 0;

    for (let i = 0; i < dieCount; i++) {
      const roll = Math.floor(Math.random() * faces) + 1;
      rolls.push(roll);
      total += roll;
    }

    const rollsStr = rolls.join(", ");
    const message =
      dieCount === 1
        ? `Rolled 1d${faces}: ${rolls[0]}`
        : `Rolled ${dieCount}d${faces}: [${rollsStr}] (total: ${total})`;

    return {
      message,
      value: {
        die_count: dieCount,
        faces,
        rolls,
        total,
      },
    };
  },
};
