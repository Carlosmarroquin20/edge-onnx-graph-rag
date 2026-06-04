import type { ReactElement } from "react";

import type { AssembledContext } from "@core/graph";

export function SubgraphPanel({
  context,
  seedLabels,
}: {
  readonly context: AssembledContext | null;
  readonly seedLabels: ReadonlyArray<string>;
}): ReactElement {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Retrieved context</h2>
        {context !== null && (
          <span className="font-mono text-[11px] text-neutral-500">
            {context.includedNodes.length} nodes · {context.tokenCount} tok
            {context.truncated ? " · truncated" : ""}
          </span>
        )}
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

      {context === null || context.text.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No context retrieved — generation runs on the bare query.
        </p>
      ) : (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 font-mono text-xs leading-relaxed text-neutral-300">
          {context.text}
        </pre>
      )}
    </div>
  );
}
