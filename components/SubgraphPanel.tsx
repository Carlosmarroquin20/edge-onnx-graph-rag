import type { ReactElement } from "react";

import type { AssembledContext } from "@core/graph";
import type { NodeId, SubgraphResult } from "@core/types";
import { SubgraphGraph } from "./SubgraphGraph.js";

export function SubgraphPanel({
  context,
  subgraph,
  seedLabels,
  seedIds,
}: {
  readonly context: AssembledContext | null;
  readonly subgraph: SubgraphResult | null;
  readonly seedLabels: ReadonlyArray<string>;
  readonly seedIds: ReadonlyArray<NodeId>;
}): ReactElement {
  const hasGraph = subgraph !== null && subgraph.nodes.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Retrieved subgraph</h2>
        {context !== null && (
          <span className="font-mono text-[11px] text-neutral-500">
            {context.includedNodes.length} nodes · {context.tokenCount} tok
            {context.truncated ? " · truncated" : ""}
          </span>
        )}
      </div>

      {hasGraph ? (
        <>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-2">
            <SubgraphGraph subgraph={subgraph} seedIds={seedIds} />
          </div>

          {seedLabels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-neutral-500">seeds:</span>
              {seedLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-md border border-emerald-800/50 bg-emerald-900/30 px-2 py-0.5 font-mono text-[11px] text-emerald-300"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {context !== null && context.text.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-[11px] text-neutral-500 transition hover:text-neutral-300">
                <span className="mr-1 inline-block transition group-open:rotate-90">▸</span>
                Context block sent to the model
              </summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 font-mono text-xs leading-relaxed text-neutral-300">
                {context.text}
              </pre>
            </details>
          )}
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          No subgraph retrieved — generation runs on the bare query.
        </p>
      )}
    </div>
  );
}
