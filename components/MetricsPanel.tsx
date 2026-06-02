import type { AggregatedMetrics, ExecutionMetrics } from "@core/types";

function ms(value: number): string {
  return `${value.toFixed(0)} ms`;
}

function rate(value: number): string {
  return `${value.toFixed(1)} tok/s`;
}

function memory(bytes: number | undefined): string {
  if (bytes === undefined) {
    return "n/a";
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Stat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.ReactElement {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-neutral-100">{value}</div>
    </div>
  );
}

export function MetricsPanel({
  latest,
  aggregates,
}: {
  readonly latest: ExecutionMetrics | null;
  readonly aggregates: ReadonlyArray<AggregatedMetrics>;
}): React.ReactElement {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-neutral-300">Execution profile</h2>

      {latest === null ? (
        <p className="text-xs text-neutral-500">No runs yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Backend" value={latest.backend.toUpperCase()} />
          <Stat label="TTFT" value={ms(latest.timeToFirstTokenMs)} />
          <Stat label="Throughput" value={rate(latest.tokensPerSecond)} />
          <Stat label="Wall clock" value={ms(latest.wallClockMs)} />
          <Stat label="Prompt tokens" value={`${latest.promptTokenCount}`} />
          <Stat label="Gen steps" value={`${latest.generatedTokenCount}`} />
          <Stat label="Peak memory" value={memory(latest.peakMemoryBytes)} />
        </div>
      )}

      {aggregates.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="py-1 pr-3 font-normal">Backend / model</th>
                <th className="py-1 pr-3 font-normal">Runs</th>
                <th className="py-1 pr-3 font-normal">p50 TTFT</th>
                <th className="py-1 pr-3 font-normal">p95 TTFT</th>
                <th className="py-1 pr-3 font-normal">Mean tok/s</th>
                <th className="py-1 font-normal">Peak mem</th>
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
                  <td className="py-1 pr-3">{row.runCount}</td>
                  <td className="py-1 pr-3">{ms(row.ttftP50Ms)}</td>
                  <td className="py-1 pr-3">{ms(row.ttftP95Ms)}</td>
                  <td className="py-1 pr-3">{rate(row.meanTokensPerSecond)}</td>
                  <td className="py-1">{memory(row.peakMemoryBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
