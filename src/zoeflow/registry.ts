import type { ZoeNodeExecutorMap } from "@/zoeflow/engine/types";
import { coinFlipNodeDefinition } from "@/zoeflow/nodes/coinFlip/definition";
import { executeCoinFlipNode } from "@/zoeflow/nodes/coinFlip/execute";
import { completionNodeDefinition } from "@/zoeflow/nodes/completion/definition";
import { executeCompletionNode } from "@/zoeflow/nodes/completion/execute";
import { diceRollNodeDefinition } from "@/zoeflow/nodes/diceRoll/definition";
import { executeDiceRollNode } from "@/zoeflow/nodes/diceRoll/execute";
import { endNodeDefinition } from "@/zoeflow/nodes/end/definition";
import { executeEndNode } from "@/zoeflow/nodes/end/execute";
import { getVariableNodeDefinition } from "@/zoeflow/nodes/getVariable/definition";
import { executeGetVariableNode } from "@/zoeflow/nodes/getVariable/execute";
import { globalStateNodeDefinition } from "@/zoeflow/nodes/globalState/definition";
import { executeGlobalStateNode } from "@/zoeflow/nodes/globalState/execute";
import { guardrailsNodeDefinition } from "@/zoeflow/nodes/guardrails/definition";
import { executeGuardrailsNode } from "@/zoeflow/nodes/guardrails/execute";
import { ifElseNodeDefinition } from "@/zoeflow/nodes/ifElse/definition";
import { executeIfElseNode } from "@/zoeflow/nodes/ifElse/execute";
import { messageNodeDefinition } from "@/zoeflow/nodes/message/definition";
import { executeMessageNode } from "@/zoeflow/nodes/message/execute";
import { ragNodeDefinition } from "@/zoeflow/nodes/rag/definition";
import { executeRagNode } from "@/zoeflow/nodes/rag/execute";
import { readDocumentNodeDefinition } from "@/zoeflow/nodes/readDocument/definition";
import { executeReadDocumentNode } from "@/zoeflow/nodes/readDocument/execute";
import { redactNodeDefinition } from "@/zoeflow/nodes/redact/definition";
import { executeRedactNode } from "@/zoeflow/nodes/redact/execute";
import { setVariableNodeDefinition } from "@/zoeflow/nodes/setVariable/definition";
import { executeSetVariableNode } from "@/zoeflow/nodes/setVariable/execute";
import { startNodeDefinition } from "@/zoeflow/nodes/start/definition";
import { executeStartNode } from "@/zoeflow/nodes/start/execute";
import { switchNodeDefinition } from "@/zoeflow/nodes/switch/definition";
import { executeSwitchNode } from "@/zoeflow/nodes/switch/execute";
import { toolNodeDefinition } from "@/zoeflow/nodes/tool/definition";
import { executeToolNode } from "@/zoeflow/nodes/tool/execute";
import { transformNodeDefinition } from "@/zoeflow/nodes/transform/definition";
import { executeTransformNode } from "@/zoeflow/nodes/transform/execute";
import {
  ZoeNodeID,
  type ZoeNodeDefinitionMap,
  type ZoeNodeDefinitionUnion,
} from "@/zoeflow/types";

export const nodeDefinitions: ZoeNodeDefinitionMap = {
  [ZoeNodeID.Start]: startNodeDefinition,
  [ZoeNodeID.End]: endNodeDefinition,
  [ZoeNodeID.Completion]: completionNodeDefinition,
  [ZoeNodeID.Guardrails]: guardrailsNodeDefinition,
  [ZoeNodeID.Message]: messageNodeDefinition,
  [ZoeNodeID.Tool]: toolNodeDefinition,
  [ZoeNodeID.Rag]: ragNodeDefinition,
  [ZoeNodeID.CoinFlip]: coinFlipNodeDefinition,
  [ZoeNodeID.DiceRoll]: diceRollNodeDefinition,
  [ZoeNodeID.ReadDocument]: readDocumentNodeDefinition,
  [ZoeNodeID.Transform]: transformNodeDefinition,
  [ZoeNodeID.Redact]: redactNodeDefinition,
  [ZoeNodeID.IfElse]: ifElseNodeDefinition,
  [ZoeNodeID.Switch]: switchNodeDefinition,
  [ZoeNodeID.SetVariable]: setVariableNodeDefinition,
  [ZoeNodeID.GetVariable]: getVariableNodeDefinition,
  [ZoeNodeID.GlobalState]: globalStateNodeDefinition,
};

export const nodeExecutors: ZoeNodeExecutorMap = {
  [ZoeNodeID.Start]: { execute: executeStartNode },
  [ZoeNodeID.End]: { execute: executeEndNode },
  [ZoeNodeID.Completion]: { execute: executeCompletionNode },
  [ZoeNodeID.Guardrails]: { execute: executeGuardrailsNode },
  [ZoeNodeID.Message]: { execute: executeMessageNode },
  [ZoeNodeID.Tool]: { execute: executeToolNode },
  [ZoeNodeID.Rag]: { execute: executeRagNode },
  [ZoeNodeID.CoinFlip]: { execute: executeCoinFlipNode },
  [ZoeNodeID.DiceRoll]: { execute: executeDiceRollNode },
  [ZoeNodeID.ReadDocument]: { execute: executeReadDocumentNode },
  [ZoeNodeID.Transform]: { execute: executeTransformNode },
  [ZoeNodeID.Redact]: { execute: executeRedactNode },
  [ZoeNodeID.IfElse]: { execute: executeIfElseNode },
  [ZoeNodeID.Switch]: { execute: executeSwitchNode },
  [ZoeNodeID.SetVariable]: { execute: executeSetVariableNode },
  [ZoeNodeID.GetVariable]: { execute: executeGetVariableNode },
  [ZoeNodeID.GlobalState]: { execute: executeGlobalStateNode },
};

/**
 * List all node definitions in the registry.
 */
export function listNodeDefinitions() {
  return Object.values(nodeDefinitions) as ZoeNodeDefinitionUnion[];
}

/**
 * Fetch a node definition by type.
 */
export function getNodeDefinition<TType extends ZoeNodeID>(type: TType) {
  return nodeDefinitions[type];
}

/**
 * Fetch a node executor by type.
 */
export function getNodeExecutor<TType extends ZoeNodeID>(type: TType) {
  return nodeExecutors[type];
}

/**
 * List node definitions that should appear in the palette.
 */
export function listPaletteNodes() {
  return listNodeDefinitions()
    .filter((definition) => definition.allowUserCreate)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Return node types with required instance counts.
 */
export function listRequiredNodeTypes() {
  return listNodeDefinitions().filter(
    (definition) => definition.requiredCount !== null,
  );
}
