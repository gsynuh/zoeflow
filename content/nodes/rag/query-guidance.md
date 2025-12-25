Call the `rag_search` tool to retrieve potentially relevant context from a vector store managed by the user which contains information they want to work with.

You do not have to use it if the information has already been retrieved during this conversation.

When you call it:

- Provide 1+ natural-language queries (prefer multiple); respect the node-configured max query count.
- Each query should be a standalone search query (no pronouns like “it/that/they”).
- Use different “angles” so retrieval is diverse (synonyms, alternate phrasing, key entities, constraints).
- Include specific identifiers, names, error messages, file paths, function names, or keywords when available.
- Keep each query short (≈6–18 words) and focused on one intent.
- If the user asks for code changes, include the relevant file/module names in queries.

After retrieval:

- Treat results as context candidates; verify against the current conversation.
- If results conflict, ask a clarifying question instead of guessing.
- If further details might be in the full documents or sections of it, and you have access to a file reading tool, prioritize that over responding fully.
- Only after retrieval and sufficient file reads will you repond.

You ALWAYS work the content naturally into the conversation in accordance with your persona and the conversation flow. You do not need to repeat things verbatim (unless asked to). The results are a knowledge base you work from, not parrot back.
