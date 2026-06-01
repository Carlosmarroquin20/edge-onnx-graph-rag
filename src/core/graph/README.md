# Knowledge Graph (Phase 2)

In-memory Graph-RAG store. Contracts live in `../types/graph.ts`.

Implemented:
- `GraphStore` — entity maps plus dual adjacency indexes (outgoing/incoming);
  O(1) lookup, O(degree) expansion, cascading node removal, endpoint integrity.
- `traversal` — k-hop BFS neighborhood retrieval (relevance-scored, bounded) and
  weighted shortest path (Dijkstra over reciprocal edge weights).
- `ids` — branded-id helpers (`asNodeId`/`asEdgeId`) and a monotonic `IdFactory`.
- `errors` — `GraphError` with a `code` discriminant.
- `contextAssembler` — ranks and packs a `SubgraphResult` into a token-bounded
  text block via an injectable `TokenEstimator` (char-heuristic default).

Pending:
- `entityExtraction` — parse source text / model output into typed nodes/edges.
- Optional embedding-based hybrid ranking over `GraphNode.embedding`.
