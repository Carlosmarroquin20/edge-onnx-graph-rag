"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactElement, ReactNode } from "react";

import { useGraphRag } from "../lib/useGraphRag.js";
import { validateModelId } from "../lib/modelId.js";
import type { DownloadState } from "../lib/loadProgress.js";
import {
  DEFAULT_MODEL_ID,
  SAMPLE_QUERY,
  SAMPLE_TEXT,
  SAMPLE_TRIPLES,
  type CorpusMode,
} from "../lib/sampleData.js";
import { MetricsPanel } from "./MetricsPanel.js";
import { SubgraphPanel } from "./SubgraphPanel.js";

const PANEL = "rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-5";
const FIELD =
  "w-full rounded-lg border border-neutral-800 bg-neutral-950 p-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40";
const PRIMARY_BTN =
  "inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-40";
const GHOST_BTN =
  "inline-flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500";

function SectionHeader({
  step,
  title,
  hint,
}: {
  readonly step: string;
  readonly title: string;
  readonly hint?: string;
}): ReactElement {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-neutral-800 font-mono text-[11px] font-medium text-neutral-400">
        {step}
      </span>
      <h2 className="text-sm font-semibold text-neutral-200">{title}</h2>
      {hint !== undefined && (
        <span className="ml-auto font-mono text-[11px] text-neutral-500">{hint}</span>
      )}
    </div>
  );
}

function Spinner(): ReactElement {
  return (
    <span
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-neutral-700 border-t-emerald-400"
      aria-hidden="true"
    />
  );
}

function Panel({ children }: { readonly children: ReactNode }): ReactElement {
  return <section className={PANEL}>{children}</section>;
}

function LoadingCard({ download }: { readonly download: DownloadState }): ReactElement {
  const percent = download.percent;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
      <div className="flex items-center gap-3">
        <Spinner />
        <p className="text-sm text-neutral-200">
          {percent === null ? "Loading the model" : "Downloading model weights"}
        </p>
        {percent !== null && (
          <span className="ml-auto font-mono text-xs tabular-nums text-emerald-300">
            {percent}%
          </span>
        )}
      </div>
      {percent !== null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        {download.file !== null && percent !== null ? (
          <>
            Fetching <span className="font-mono text-neutral-400">{download.file}</span>.{" "}
          </>
        ) : null}
        The first run downloads the model weights and caches them in your browser;
        later runs start instantly. Inference then runs on-device — no server
        involved.
      </p>
    </div>
  );
}

export function GraphRagConsole(): ReactElement {
  const rag = useGraphRag(DEFAULT_MODEL_ID);

  const [mode, setMode] = useState<CorpusMode>("triples");
  const [corpus, setCorpus] = useState<string>(SAMPLE_TRIPLES);
  const [modelId, setModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [query, setQuery] = useState<string>(SAMPLE_QUERY);

  // Build the initial graph once so "Ask" works on first load.
  const didInit = useRef(false);
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      rag.buildGraph(corpus, mode);
    }
  }, [rag, corpus, mode]);

  const isBusy = rag.phase === "loading" || rag.phase === "generating";
  const modelIdCheck = validateModelId(modelId);
  const canAsk = !isBusy && query.trim().length > 0 && modelIdCheck.ok;

  const onModeChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value as CorpusMode;
    setMode(next);
    setCorpus(next === "triples" ? SAMPLE_TRIPLES : SAMPLE_TEXT);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Configuration / input */}
      <div className="space-y-6 lg:col-span-2">
        <Panel>
          <SectionHeader
            step="1"
            title="Knowledge source"
            hint={`${rag.graphStats.nodeCount} nodes · ${rag.graphStats.edgeCount} edges`}
          />
          <select
            aria-label="Knowledge source format"
            value={mode}
            onChange={onModeChange}
            className={`${FIELD} mb-2 cursor-pointer`}
          >
            <option value="triples">Triples — subject | predicate | object</option>
            <option value="text">Free text — co-occurrence</option>
          </select>
          <textarea
            aria-label="Knowledge source text"
            value={corpus}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setCorpus(e.target.value)}
            rows={7}
            className={`${FIELD} resize-y font-mono text-xs leading-relaxed`}
            spellCheck={false}
          />
          <button type="button" onClick={() => rag.buildGraph(corpus, mode)} className={`${GHOST_BTN} mt-3`}>
            Build knowledge graph
          </button>
        </Panel>

        <Panel>
          <SectionHeader step="2" title="Model" />
          <input
            aria-label="Model repository id"
            aria-invalid={!modelIdCheck.ok}
            value={modelId}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setModelId(e.target.value)}
            onBlur={() => {
              if (modelIdCheck.ok) {
                void rag.setModel(modelId);
              }
            }}
            className={`${FIELD} font-mono text-xs ${modelIdCheck.ok ? "" : "border-red-700 focus-visible:ring-red-500/40"}`}
            spellCheck={false}
          />
          {modelIdCheck.ok ? (
            <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
              Any Transformers.js-compatible ONNX text-generation repo
              (namespace/name). Weights download once and cache in your browser.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-red-400">{modelIdCheck.reason}</p>
          )}
        </Panel>

        <Panel>
          <SectionHeader step="3" title="Ask" />
          <textarea
            aria-label="Query"
            value={query}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setQuery(e.target.value)}
            rows={3}
            className={`${FIELD} resize-y`}
            spellCheck={false}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canAsk}
              aria-busy={isBusy}
              onClick={() => void rag.ask(query)}
              className={PRIMARY_BTN}
            >
              {isBusy && <Spinner />}
              {rag.phase === "loading"
                ? "Loading model…"
                : rag.phase === "generating"
                  ? "Generating…"
                  : "Ask the graph"}
            </button>
            {isBusy && (
              <button type="button" onClick={() => rag.cancel()} className={GHOST_BTN}>
                Cancel
              </button>
            )}
          </div>
          {rag.error !== null && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 p-2.5 text-xs text-red-300"
            >
              {rag.error}
            </p>
          )}
        </Panel>
      </div>

      {/* Results — the focal point */}
      <div className="space-y-6 lg:col-span-3">
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-200">Answer</h2>
            <span
              role="status"
              aria-live="polite"
              className="font-mono text-[11px] text-neutral-500"
            >
              {rag.status}
            </span>
          </div>

          {rag.phase === "loading" && rag.answer.length === 0 ? (
            <LoadingCard download={rag.download} />
          ) : rag.answer.length > 0 ? (
            <div
              aria-live="polite"
              className="min-h-24 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-100"
            >
              {rag.answer}
              {rag.phase === "generating" && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-emerald-400 align-text-bottom" />
              )}
            </div>
          ) : (
            <p className="min-h-24 text-sm text-neutral-500">
              Build a graph, then ask a question — the answer streams here as the
              model decodes it.
            </p>
          )}
        </Panel>

        <Panel>
          <SubgraphPanel
            context={rag.outcome?.context ?? null}
            seedLabels={rag.outcome?.seedLabels ?? []}
          />
        </Panel>

        <Panel>
          <MetricsPanel
            latest={rag.outcome?.metrics ?? null}
            aggregates={rag.aggregates}
          />
        </Panel>
      </div>
    </div>
  );
}
