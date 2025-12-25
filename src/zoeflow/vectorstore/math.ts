/**
 * Compute cosine similarity between two vectors.
 *
 * @param a - Vector A.
 * @param b - Vector B.
 */
export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const valueA = a[index] ?? 0;
    const valueB = b[index] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Compute the L2 norm of a vector.
 *
 * @param vector - Input vector.
 */
export function vectorNorm(vector: number[]) {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  return Math.sqrt(sum);
}
