# Read Document Tool Instructions

Use the `read_document` tool to read documents from the vector store.

## When to Read Documents

- **After rag_search**: When you have RAG fragments in context with citations, use `read_document` to read the full context around cited sections. RAG results include `doc_id`, `start_line`, `end_line`, and section breadcrumbs in their citations.
- **Exploring documents**: When you need to understand a document's structure or content, read the first or last lines to get a feel for the document before reading specific sections.

## Reading Strategies

### Reading Specific Sections from RAG Citations

When RAG results provide citations with line numbers and section information:

- Use the `doc_id` from the citation (this is the preferred identifier)
- Use `start_line` and `end_line` parameters to read the exact range cited by RAG
- Optionally use the `section` parameter if the citation includes a section breadcrumb/path

### Exploring Documents

When you need to understand a document's structure or get an overview:

- Read the **first lines** (e.g., `start_line: 0, end_line: 50`) to see the document's introduction, table of contents, or initial structure
- Read the **last lines** to see conclusions, summaries, or final sections
- Use these previews to determine which specific sections to read in full

## Best Practices

- Always prefer `doc_id` over `source_uri` when available (from RAG citations)
- When reading line ranges, include some context before and after the target lines (e.g., ±10 lines) for better understanding
- If a document is very long, read specific sections rather than the entire document to stay within token limits
- Use section identifiers when available to read semantically meaningful chunks rather than arbitrary line ranges
