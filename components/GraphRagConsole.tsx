"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";

import { useGraphRag } from "../lib/useGraphRag.js";
import { validateModelId } from "../lib/modelId.js";
import {
  DEFAULT_MODEL_ID,
  SAMPLE_QUERY,
  SAMPLE_TEXT,
  SAMPLE_TRIPLES,
  type CorpusMode,
} from "../lib/sampleData.js";
import { MetricsPanel } from "./MetricsPanel.js";
import { SubgraphPanel } from "./SubgraphPanel.js";

const PANEL = "rounded-lg border border-neutral-800 bg-neutral-900/40 p-4";
const FIELD =
  "w-full rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-100 focus:border-neutral-600 focus:outline-none";

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

  const onModeChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value as CorpusMode;
    setMode(next);
    setCorpus(next === "triples" ? SAMPLE_TRIPLES : SAMPLE_TEXT);
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <section className={PANEL}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-300">Knowledge source</h2>
            <select
              value={mode}
              onChange={onModeChange}
              className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs"
            >
              <option value="triples">Triples (subject | predicate | object)</option>
              <option value="text">Free text (co-occurrence)</option>
            </select>
          </div>
          <textarea
            value={corpus}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setCorpus(e.target.value)}
            rows={7}
            className={`${FIELD} resize-y`}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => rag.buildGraph(corpus, mode)}
            className="mt-2 rounded bg-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white"
          >
            Build graph
          </button>
          <span className="ml-3 text-xs text-neutral-500">
            {rag.graphStats.nodeCount} nodes · {rag.graphStats.edgeCount} edges
          </span>
        </section>

        <section className={PANEL}>
          <h2 className="mb-2 text-sm font-semibold text-neutral-300">Model</h2>
          <input
            value={modelId}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setModelId(e.target.value)}
            onBlur={() => {
              if (modelIdCheck.ok) {
                void rag.setModel(modelId);
              }
            }}
            aria-invalid={!modelIdCheck.ok}
            className={`${FIELD} ${modelIdCheck.ok ? "" : "border-red-700"}`}
            spellCheck={false}
          />
          {modelIdCheck.ok ? (
            <p className="mt-1 text-[11px] text-neutral-500">
              Any Transformers.js-compatible ONNX text-generation repo
              (namespace/name). First run downloads and caches weights in the
              browser.
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-red-400">{modelIdCheck.reason}</p>
          )}
        </section>

        <section className={PANEL}>
          <h2 className="mb-2 text-sm font-semibold text-neutral-300">Query</h2>
          <textarea
            value={query}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setQuery(e.target.value)}
            rows={3}
            className={`${FIELD} resize-y`}
            spellCheck={false}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={isBusy || query.trim().length === 0 || !modelIdCheck.ok}
              onClick={() => void rag.ask(query)}
              className="rounded bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ask
            </button>
            {isBusy && (
              <button
                type="button"
                onClick={() => rag.cancel()}
                className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
              >
                Cancel
              </button>
            )}
            <span className="text-xs text-neutral-500">{rag.status}</span>
          </div>
          {rag.error !== null && (
            <p className="mt-2 rounded border border-red-900/60 bg-red-950/40 p-2 text-xs text-red-300">
              {rag.error}
            </p>
          )}
        </section>
      </div>

      <div className="space-y-4">
        <section className={PANEL}>
          <h2 className="mb-2 text-sm font-semibold text-neutral-300">Answer</h2>
          <div className="min-h-24 whitespace-pre-wrap text-sm text-neutral-100">
            {rag.answer}
            {rag.phase === "generating" && (
              <span className="ml-0.5 inline-block h-3 w-2 animate-pulse bg-emerald-400 align-middle" />
            )}
          </div>
        </section>

        <section className={PANEL}>
          <SubgraphPanel
            context={rag.outcome?.context ?? null}
            seedLabels={rag.outcome?.seedLabels ?? []}
          />
        </section>

        <section className={PANEL}>
          <MetricsPanel
            latest={rag.outcome?.metrics ?? null}
            aggregates={rag.aggregates}
          />
        </section>
      </div>
    </div>
  );
}
