import {
  ZoeAttributeKind,
  ZoeNodeCategory,
  ZoeNodeID,
  ZoePortDirection,
  type ZoeNodeDefinition,
  type ZoeReadDocumentNodeData,
} from "@/zoeflow/types";

import { READ_DOCUMENT_DEFAULTS } from "@/zoeflow/nodes/shared/defaults";

/**
 * Create default data for the ReadDocument node.
 */
export function createReadDocumentNodeData(): ZoeReadDocumentNodeData {
  return {
    type: ZoeNodeID.ReadDocument,
    title: READ_DOCUMENT_DEFAULTS.title,
    label: "",
  };
}

export const readDocumentNodeDefinition: ZoeNodeDefinition<ZoeReadDocumentNodeData> =
  {
    type: ZoeNodeID.ReadDocument,
    label: "Read File",
    description:
      "Read a full document or specific section from the vector store by document ID. Use this after RAG search to get full context for cited sections.",
    category: ZoeNodeCategory.Tool,
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
    ],
    inputPorts: [
      {
        id: "trigger",
        label: "Trigger",
        direction: ZoePortDirection.Input,
      },
      {
        id: "enable",
        label: "Enable",
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
    createData: createReadDocumentNodeData,
  };
