# Node Authoring (ZoeFlow)

This project intentionally renders most nodes with a shared UI shape so adding new nodes stays focused on runtime behavior, ports, and attributes instead of React code.

## Mental model

- **Node ID**: A string enum member in `src/zoeflow/types.ts` (`ZoeNodeID`). It is the identity used by engine + UI.
- **Node category**: A classification that groups nodes by purpose (e.g., Tool, Agent, Control). Used for palette organization and styling.
- **Node definition**: Declarative metadata in `src/zoeflow/nodes/<node>/definition.ts` that drives:
  - Palette visibility (`allowUserCreate`)
  - Inspector fields (`attributes`)
  - Canvas ports (`inputPorts`, `outputPorts`)
  - Canvas affordances (`externalCall`, `getCanvasLabel`, `showUserLabelOnCanvas`)
  - Node category (`category`)
- **Node executor**: Runtime implementation in `src/zoeflow/nodes/<node>/execute.ts`.
- **Canvas renderer**: The graph UI uses a single renderer for all nodes: `src/components/graph/nodes/StandardNode.tsx`.

## Create a new node (engine + UI)

1. **Add node type to types**: Add a new enum member to `src/zoeflow/types.ts` (`ZoeNodeID`), and extend `ZoeNodeData` union with a typed data shape for your node (e.g., `ZoeYourNodeData`).

2. **Create node folder and core files**: Create a new folder `src/zoeflow/nodes/<yourNode>/` with:
   - `definition.ts`: exports `create<YourNode>Data()` function and `<yourNode>Definition` object
   - `execute.ts`: exports `execute<YourNode>Node()` function

3. **Register the node**: Register the node in `src/zoeflow/registry.ts`:
   - Import the definition and executor
   - Add the definition to `nodeDefinitions` map
   - Add the executor to `nodeExecutors` map

4. **Define node behavior**: Configure the definition object:
   - `attributes`: Controls what appears in the inspector (and what is persisted in flow JSON)
   - `inputPorts`/`outputPorts`: Control the handles on the canvas and edge validation
   - If outputs depend on data (ex: Switch cases), make `outputPorts` a function that takes `data` as parameter
   - `allowUserCreate`: Whether the node appears in the palette
   - `requiredCount`: Number of required instances (or `null` if unlimited)
   - `category`: Node category for palette organization
   - Optional: `externalCall`, `icon`, `getCanvasLabel`, `showUserLabelOnCanvas`, `description`

The UI automatically starts rendering the new node in the canvas and palette based on the definition.

## Developer tools (optional)

If your node can be used as a tool by Completion nodes (exposed to LLMs), you need additional files:

1. **Create `developer.ts`**: Export a `ZoeDeveloperToolDefinition` object that includes:
   - `key`: Your node's `ZoeNodeID`
   - `label` and `description`: Tool metadata
   - `openRouterTool`: OpenRouter tool schema (function name, description, parameters)
   - `execute`: Async function that executes the tool and returns `{ message, value? }`

2. **Register in tool registry**: Add your tool definition to `src/zoeflow/nodes/tool/developer.ts`:
   - Import your tool definition
   - Add it to the `TOOL_DEFINITIONS` record

3. **Add to ZoeToolNodeID** (if not already): Ensure your node ID is included in the `ZoeToolNodeID` type in `src/zoeflow/types.ts`.

4. **Create `collection.ts` (if needed)**: If your tool node needs to be collected as input to Completion nodes, create a collection function that:
   - Takes execution context options
   - Returns a result with `tools`, `contributions`, and `error` fields
   - Filters connected nodes and evaluates enable/muted states
   - See examples in `coinFlip/collection.ts`, `rag/collection.ts`, etc.

5. **Use collection in Completion**: Import and call your collection function in `src/zoeflow/nodes/completion/execute.ts` to gather tool contributions.

## Canvas display variants (without new React components)

Most visual differences should be expressed as definition metadata instead of new node components:

- `externalCall: true` shows the "external call" badge (brain icon) on the node.
- `icon`: Optional custom icon component (lucide-react) to override the default category-based icon.
- `getCanvasLabel(data)`: Function that lets a node render a different title on the canvas based on its data (example: Message role).
- `showUserLabelOnCanvas: false`: Hides the user-defined label line on the node (example: Start/End).

If you need a “variant” that changes defaults but not behavior, prefer:

- **Defaults**: implement via `createData()` returning different starting values.
- **Display**: implement via `getCanvasLabel(data)` so the node reads correctly without branching in the renderer.

Only introduce a dedicated React node component if the node requires interactive UI inside the node body (not just ports/title/badges).

## Ports and edge validation

Ports are part of the runtime contract:

- The engine validates that edges reference valid port ids (`src/zoeflow/engine/validation.ts`).
- Edge ordering during planning uses output port ordering (`src/zoeflow/engine/run.ts`).

Prefer stable port ids (`in`, `out`, `then`, `else`, `case-0`, …). If ports are dynamic, ensure ids remain deterministic for the same node data.
