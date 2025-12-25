export enum VectorStoreFormatVersion {
  V1 = "v1",
}

export type VectorStoreItem = {
  id: string;
  text: string;
  embedding: number[];
  embeddingNorm: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type VectorStoreFile = {
  version: VectorStoreFormatVersion;
  dimension: number | null;
  items: VectorStoreItem[];
};

export type VectorStoreQueryResult = {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  score: number;
};
