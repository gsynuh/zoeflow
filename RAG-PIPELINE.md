# RAG Pipeline Architecture

## Overview

ZoeFlow implements a document-based RAG pipeline with markdown-aware processing, semantic retrieval via vector search, and LLM-augmented chunk enrichment. The pipeline spans document ingestion, embedding generation, vector indexing, query-time retrieval, and context injection into completion nodes.

## 1. Document Upload & Ingestion

**Endpoint**: `POST /api/v1/vectorstore/documents/upload`

- Accepts markdown files (`.md`) up to 10MB
- Generates deterministic `docId` via content hash (base64, 16 chars) + filename
- Creates version identifier (timestamp-based)
- Stores raw document content to disk (`data/documents/{docId}/{version}.md`)
- Creates metadata entry with status `pending`
- Returns immediately; processing starts explicitly via `/documents/start`

## 2. Document Processing Pipeline

**Entry Point**: `POST /api/v1/vectorstore/documents/start`

### 2.1 Normalization
- Line ending normalization (`\r\n` → `\n`, `\r` → `\n`)
- Trailing whitespace removal per line

### 2.2 Section Parsing
**Function**: `parseMarkdownSections()`

- Parses markdown headings (`#` through `######`) to create hierarchical sections
- Maintains `headingPath` array (breadcrumb trail: `["Parent", "Child", "Grandchild"]`)
- Tracks character offsets and line numbers for provenance
- Falls back to single "Document" section if no headings found

### 2.3 Chunking Strategy
**Function**: `splitIntoChunks()`

- **Target size**: 500 tokens (configurable, defaults to OpenAI `cl100k_base` tokenizer)
- **Overlap**: 50 tokens between chunks
- **Structure preservation**:
  - Never splits inside code fences (``` blocks)
  - Preserves table boundaries
  - Maintains list item integrity
- **Break point selection**: Binary search for optimal split positions respecting block boundaries
- Each chunk includes metadata: `startLine`, `endLine`, `startChar`, `endChar`, `headingPath`

### 2.4 Chunk Enrichment (Optional)
**Condition**: Enabled via `ZOEFLOW_LLM_AUGMENTED_CHUNKING=1`

- Uses LLM (`OPENROUTER_CHUNK_ENRICHMENT_MODEL`) to generate semantically-enhanced text
- Input: raw chunk text + outward context (surrounding lines) + document metadata
- Output: compact, enriched text for embedding generation (max 8000 chars)
- Cached via `ChunkEnrichmentCache` to avoid redundant LLM calls
- **Critical distinction**: Enriched text is used ONLY for embedding generation, NOT for LLM consumption

### 2.5 Embedding Generation
**Endpoint**: `POST /api/v1/embedding` (proxies to OpenRouter)

- **Model**: Configurable via `OPENROUTER_EMBEDDING_MODEL` (default: `text-embedding-3-small`)
- **Batch processing**: Processes chunks in batches (default: 10)
- **Caching**: `VectorStoreCache` caches embeddings by text content + model
- **Text used for embedding** (variable based on active flags):

  **Default format** (when `ZOEFLOW_LLM_AUGMENTED_CHUNKING` disabled):
  ```
  source: {sourceUri}
  doc_id: {docId}
  version: {version}
  section: {headingPath.join(" / ")}
  
  {chunkText}
  ```

  **Enriched format** (when `ZOEFLOW_LLM_AUGMENTED_CHUNKING=1`):
  - Format controlled by `ENRICHMENT_WITH` bit flags in code
  - Includes LLM-generated fields: summary, possible_queries
  - May include: source_uri, heading_path, author, description, tags, content_type
  - Structure: metadata headers + LLM-generated summary/queries + original chunk text
  - Max length: 8000 characters (clamped)
  - **Purpose**: Improve semantic search quality; NOT returned to LLM

### 2.6 Vector Store Indexing
- Deletes previous version chunks for the document (if reprocessing)
- Upserts into vector store (HNSW-based similarity search):
  - **`text` field**: Raw chunk text (what LLM sees during retrieval)
  - **`embedding` field**: Vector generated from enriched text (if enabled) or default format
  - **`metadata.vectorized_text`**: Enriched text stored for reference/debugging (if enrichment enabled)
- Stores metadata alongside vectors: `docId`, `version`, `sourceUri`, `headingPath`, `startLine`, `endLine`, `contentType`, `language`, `chunk_variant`
- Status tracking: `pending` → `processing` → `completed` (or `error`)

**Important**: The enriched text improves retrieval quality by generating better embeddings, but the LLM always receives the raw chunk text during RAG retrieval. This ensures the LLM sees original content without LLM-generated summaries that could introduce bias or errors.

## 3. RAG Retrieval

### 3.1 Query Processing
**Node**: RAG node (provides `rag_search` tool to Completion nodes)

- Completion node collects RAG contributions from connected RAG nodes
- RAG node injects query guidance (system message) and `rag_search` tool definition
- LLM generates multiple natural-language queries (1–5, configurable `maxQueries`)

### 3.2 Multi-Query Vector Search
**Endpoint**: `POST /api/v1/vectorstore/query-many`

- Accepts array of queries
- Embeds all queries in batch (with caching via `QueryCache`)
- Performs vector similarity search for each query (`topK` results per query, default: 5)
- **Reciprocal Rank Fusion (RRF)**: Combines multiple ranked lists
  - Formula: `RRF_score = Σ(1 / (k + rank_i))` where `k=60`
  - Promotes documents appearing across multiple queries
  - Preserves original similarity scores for filtering (`minScore` threshold)

### 3.3 Result Formatting
- Returns deduplicated results sorted by RRF score
- Each result includes: `id`, `text` (raw chunk text), `score` (RRF), `similarityScore` (original), `metadata`
- Metadata contains: `doc_id`, `version`, `source_uri`, `heading_path`, `start_line`, `end_line`
- **LLM receives raw chunk text**: The `text` field contains the original chunk content, not the enriched version used for embedding

## 4. Context Integration

### 4.1 RAG Node Contribution
- RAG node provides `rag_search` tool to Completion node
- Query guidance injected as system message (priority: -50)
- Tool results formatted as context messages with citations

### 4.2 Completion Node Execution
**Function**: `executeCompletionNode()`

- Collects RAG contributions via `collectRagInputContributions()`
- Builds completion messages with RAG context
- Supports iterative tool-calling loop (max 10 iterations)
- RAG results included in conversation context for LLM

## 5. READ Tool (Post-Retrieval Access)

**Tool**: `read_document` (provided by ReadDocument node)

- **Purpose**: Access full documents or specific sections after RAG retrieval
- **Input**: `doc_id` (from RAG citation) or `source_uri`, optional `section`, `start_line`, `end_line`, `version`
- **Endpoint**: `POST /api/v1/vectorstore/documents/read`
- **Strategy**:
  - Priority: line range > section heading > full document
  - Section extraction via heading matching (simplified AST parsing)
  - Returns document content with metadata

## 6. Assistant Response Generation

- Completion node streams response via OpenRouter
- RAG context naturally integrated into conversation
- Tool calls (including `rag_search` and `read_document`) executed iteratively
- Final response includes citations and references to source documents

## Key Design Decisions

- **Markdown-aware chunking**: Preserves structure (code blocks, tables, lists) for better retrieval quality
- **Section-based organization**: Heading hierarchy enables semantic section retrieval
- **Multi-query RRF**: Improves recall by combining diverse query perspectives
- **Semantic enrichment for retrieval only**: Enriched text improves embedding quality but LLM always sees raw content
- **Provenance tracking**: Line numbers and character offsets enable precise citation
- **Versioning**: Supports document updates with version tracking
- **Caching**: Embeddings and queries cached to reduce API costs and latency

## Chunk Enrichment: Design Rationale

### How It Works

When `ZOEFLOW_LLM_AUGMENTED_CHUNKING=1`:
1. **Enrichment phase**: LLM generates summary, possible queries, and semantic metadata for each chunk
2. **Embedding phase**: Enriched text (not raw text) is embedded to create the vector
3. **Storage phase**: Raw chunk text is stored in `text` field; enriched text stored in `metadata.vectorized_text`
4. **Retrieval phase**: Vector search uses enriched embeddings to find relevant chunks
5. **LLM consumption**: LLM receives raw chunk text, not enriched version

### Why This Design?

**Pros:**
- **Better semantic search**: LLM-generated summaries/queries improve embedding quality and retrieval precision
- **Preserves accuracy**: LLM sees original content without potential hallucinations from enrichment LLM
- **No bias injection**: Enrichment artifacts don't contaminate the content the LLM processes
- **Flexible**: Can improve retrieval without changing what users/LLMs consume
- **Debuggable**: Enriched text stored in metadata for analysis/comparison

**Cons:**
- **Additional cost**: Requires LLM calls during indexing (mitigated by caching)
- **Processing latency**: Enrichment adds time to document processing pipeline
- **Potential mismatch**: Enriched text used for search may not perfectly align with raw content semantics
- **Cache complexity**: Must manage separate caches for enrichment and embeddings
- **Model dependency**: Quality depends on enrichment model; poor model = poor retrieval

### Trade-offs

This approach prioritizes **retrieval quality** (via enriched embeddings) while maintaining **content fidelity** (via raw text consumption). It's suitable when:
- Documents benefit from semantic summarization for search
- Original content accuracy is critical
- Processing cost/latency is acceptable
- Retrieval precision matters more than indexing speed

