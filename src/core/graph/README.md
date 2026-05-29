# Knowledge Graph (Phase 2)

In-memory Graph-RAG store. Contracts live in `../types/graph.ts`.

Planned modules:
- `GraphStore` — `Map<NodeId, GraphNode>` + adjacency `Map<NodeId, Set<EdgeId>>`.
- `entityExtraction` — parse source text / model output into typed nodes/edges.
- `traversal` — k-hop BFS, weighted shortest path, neighborhood expansion.
- `contextAssembler` — rank and pack the retrieved subgraph into the prompt budget.

Not yet implemented.
