import type { AssembledContext } from "@core/graph";

export function SubgraphPanel({
  context,
  seedLabels,
}: {
  readonly context: AssembledContext | null;
  readonly seedLabels: ReadonlyArray<string>;
}): React.ReactElement {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">
          Retrieved context
        </h2>
        {context !== null && (
          <span className="text-[10px] uppercase tracking-wide text-neutral-500">
            {context.includedNodes.length} nodes · {context.tokenCount} tok
            {context.truncated ? " · truncated" : ""}
          </span>
        )}
      </div>

      {seedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {seedLabels.map((label) => (
            <span
              key={label}
              className="rounded bg-emerald-900/40 px-2 py-0.5 text-[11px] text-emerald-300"
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
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-neutral-800 bg-neutral-900/60 p-3 text-xs text-neutral-300">
          {context.text}
        </pre>
      )}
    </section>
  );
}
