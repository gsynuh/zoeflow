"use client";

import { ModelsDialog } from "@/components/graph/ModelsDialog";
import { RagTestDialog } from "@/components/graph/RagTestDialog";
import { TypeScriptPreviewDialog } from "@/components/graph/TypeScriptPreviewDialog";
import { SystemDialogHost } from "@/components/system/SystemDialogHost";
import { VectorStoreDialog } from "@/components/vectorstores/VectorStoreDialog";
import {
  ZoeNodeID,
  type ZoeGraph,
  type ZoeNodeData,
  type ZoeRagNodeData,
} from "@/zoeflow/types";

type Props = {
  previewGraph: ZoeGraph;
  typeScriptPreviewOpen: boolean;
  setTypeScriptPreviewOpen: (open: boolean) => void;
  modelsOpen: boolean;
  setModelsOpen: (open: boolean) => void;
  ragTestOpen: boolean;
  setRagTestOpen: (open: boolean) => void;
  vectorStoreOpen: boolean;
  setVectorStoreOpen: (open: boolean) => void;
  selectedData: ZoeNodeData | null;
};

export function GraphEditorDialogs({
  previewGraph,
  typeScriptPreviewOpen,
  setTypeScriptPreviewOpen,
  modelsOpen,
  setModelsOpen,
  ragTestOpen,
  setRagTestOpen,
  vectorStoreOpen,
  setVectorStoreOpen,
  selectedData,
}: Props) {
  return (
    <>
      <SystemDialogHost />
      <TypeScriptPreviewDialog
        open={typeScriptPreviewOpen}
        onOpenChange={setTypeScriptPreviewOpen}
        graph={previewGraph}
      />
      <ModelsDialog open={modelsOpen} onOpenChange={setModelsOpen} />
      <VectorStoreDialog
        open={vectorStoreOpen}
        onOpenChange={setVectorStoreOpen}
      />
      {selectedData?.type === ZoeNodeID.Rag && (
        <RagTestDialog
          open={ragTestOpen}
          onOpenChange={setRagTestOpen}
          nodeData={selectedData as ZoeRagNodeData}
        />
      )}
    </>
  );
}
