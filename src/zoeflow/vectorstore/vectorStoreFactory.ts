import { JsonVectorStore } from "@/zoeflow/vectorstore/jsonVectorStore";
import { VectraVectorStore } from "@/zoeflow/vectorstore/vectraVectorStore";

export type VectorStoreOptions = {
  storeId?: string;
  rootDir?: string;
};

/**
 * Create a vector store using the configured backend.
 *
 * Controlled via `USE_VECTRA=true` (defaults to JSON).
 *
 * @param options - Vector store creation options.
 */
export function createVectorStore(options?: VectorStoreOptions) {
  const useVectra = process.env.USE_VECTRA === "true";
  return useVectra
    ? new VectraVectorStore(options)
    : new JsonVectorStore(options);
}
