import type { ReactElement } from "react";

import type { AggregatedMetrics, ExecutionMetrics } from "@core/types";

function ms(value: number): string {
  return `${value.toFixed(0)} ms`;
}

function rate(value: number): string {
  return value.toFixed(1);
}

function memory(bytes: number | undefined): string {
  if (bytes === undefined) {
    return "n/a";
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function BackendBadge({ backend }: { readonly backend: string }): ReactElement {
  const isGpu = backend.toLowerCase() === "webgpu";
  const tone = isGpu
    ? "border-emerald-700/60 bg-emerald-900/30 text-emerald-300"
    : "border-sky-700/60 bg-sky-900/30 text-sky-300";
  return (
    <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${tone}`}>
      {backend.toUpperCase()}
    </span>
  );
}

function Hero({
  value,
  unit,
  label,
}: {
  readonly value: string;
  readonly unit: string;
  readonly label: string;
}): ReactElement {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tabular-nums text-neutral-50">
          {value}
        </span>
        <span className="font-mono text-xs text-neutral-500">{unit}</span>
      </div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-neutral-500">
        {label}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className="rounded-lg border border-neutral-800/70 bg-neutral-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm tabular-nums text-neutral-200">{value}</div>
    </div>
  );
}

export function MetricsPanel({
  latest,
  aggregates,
}: {
  readonly latest: ExecutionMetrics | null;
  readonly aggregates: ReadonlyArray<AggregatedMetrics>;
}): ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Execution profile</h2>
        {latest !== null && <BackendBadge backend={latest.backend} />}
      </div>

      {latest === null ? (
        <p className="text-xs text-neutral-500">
          Metrics appear here after the first run — measured on your device.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Hero value={rate(latest.tokensPerSecond)} unit="tok/s" label="Throughput" />
            <Hero
              value={latest.timeToFirstTokenMs.toFixed(0)}
              unit="ms"
              label="Time to first token"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Wall clock" value={ms(latest.wallClockMs)} />
            <Stat label="Prompt tokens" value={`${latest.promptTokenCount}`} />
            <Stat label="Gen steps" value={`${latest.generatedTokenCount}`} />
            <Stat label="Peak memory" value={memory(latest.peakMemoryBytes)} />
          </div>
        </>
      )}

      {aggregates.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="py-1 pr-3 font-normal">Backend / model</th>
                <th className="py-1 pr-3 font-normal">Runs</th>
                <th className="py-1 pr-3 font-normal">p50</th>
                <th className="py-1 pr-3 font-normal">p95</th>
                <th className="py-1 pr-3 font-normal">tok/s</th>
                <th className="py-1 font-normal">Peak</th>
              </tr>
            </thead>
            <tbody className="text-neutral-300">
              {aggregates.map((row) => (
                <tr
                  key={`${row.backend}:${row.modelId}`}
                  className="border-t border-neutral-800"
                >
                  <td className="py-1 pr-3">
                    {row.backend.toUpperCase()} · {row.modelId}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">{row.runCount}</td>
                  <td className="py-1 pr-3 tabular-nums">{ms(row.ttftP50Ms)}</td>
                  <td className="py-1 pr-3 tabular-nums">{ms(row.ttftP95Ms)}</td>
                  <td className="py-1 pr-3 tabular-nums">{rate(row.meanTokensPerSecond)}</td>
                  <td className="py-1 tabular-nums">{memory(row.peakMemoryBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
