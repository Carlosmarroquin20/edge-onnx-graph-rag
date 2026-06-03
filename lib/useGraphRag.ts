"use client";

/**
 * React binding for {@link GraphRagSession}.
 *
 * Holds the session in a ref (stable across renders) and projects its async
 * lifecycle into render state: build status, streamed answer, per-run outcome,
 * and cross-run aggregates. Generation is cancellable via an `AbortController`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  GraphRagSession,
  type AskOutcome,
  type GraphStats,
} from "./graphRagClient.js";
import { DEFAULT_MODEL_ID, type CorpusMode } from "./sampleData.js";
import type { AggregatedMetrics } from "@core/types";

export type Phase = "idle" | "loading" | "generating" | "error";

export interface UseGraphRag {
  readonly phase: Phase;
  readonly status: string;
  readonly answer: string;
  readonly error: string | null;
  readonly graphStats: GraphStats;
  readonly outcome: AskOutcome | null;
  readonly aggregates: ReadonlyArray<AggregatedMetrics>;
  readonly buildGraph: (source: string, mode: CorpusMode) => void;
  readonly ask: (query: string) => Promise<void>;
  readonly setModel: (modelId: string) => Promise<void>;
  readonly cancel: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useGraphRag(modelId: string = DEFAULT_MODEL_ID): UseGraphRag {
  const sessionRef = useRef<GraphRagSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [graphStats, setGraphStats] = useState<GraphStats>({
    nodeCount: 0,
    edgeCount: 0,
  });
  const [outcome, setOutcome] = useState<AskOutcome | null>(null);
  const [aggregates, setAggregates] = useState<ReadonlyArray<AggregatedMetrics>>([]);

  const getSession = useCallback((): GraphRagSession => {
    if (sessionRef.current === null) {
      sessionRef.current = new GraphRagSession(modelId);
    }
    return sessionRef.current;
  }, [modelId]);

  // Terminate the inference worker (freeing model/GPU/WASM memory) on unmount.
  useEffect(() => {
    return () => {
      void sessionRef.current?.disposeEngine();
      sessionRef.current = null;
    };
  }, []);

  const buildGraph = useCallback(
    (source: string, mode: CorpusMode): void => {
      try {
        const stats = getSession().buildGraph(source, mode);
        setGraphStats(stats);
        setError(null);
        if (phase === "error") {
          setPhase("idle");
        }
        setStatus(`Graph built: ${stats.nodeCount} nodes, ${stats.edgeCount} edges.`);
      } catch (caught) {
        setError(messageOf(caught));
        setPhase("error");
      }
    },
    [getSession, phase],
  );

  const setModel = useCallback(
    async (id: string): Promise<void> => {
      try {
        await getSession().setModel(id);
        setError(null);
        setStatus(`Model set to ${id}.`);
      } catch (caught) {
        setError(messageOf(caught));
      }
    },
    [getSession],
  );

  const ask = useCallback(
    async (query: string): Promise<void> => {
      const session = getSession();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setAnswer("");
      setOutcome(null);
      setPhase("loading");
      setStatus("Preparing…");

      try {
        const result = await session.ask(query, {
          signal: controller.signal,
          onStatus: setStatus,
          onToken: (text) => {
            setPhase("generating");
            setAnswer((previous) => previous + text);
          },
        });
        setOutcome(result);
        setAggregates(session.aggregates());
        setPhase("idle");
        setStatus(
          `Done on ${result.metrics.backend.toUpperCase()} · TTFT ${result.metrics.timeToFirstTokenMs.toFixed(0)}ms · ${result.metrics.tokensPerSecond.toFixed(1)} tok/s.`,
        );
      } catch (caught) {
        if (controller.signal.aborted) {
          setStatus("Cancelled.");
          setPhase("idle");
        } else {
          setError(messageOf(caught));
          setPhase("error");
        }
      } finally {
        abortRef.current = null;
      }
    },
    [getSession],
  );

  const cancel = useCallback((): void => {
    abortRef.current?.abort();
  }, []);

  return {
    phase,
    status,
    answer,
    error,
    graphStats,
    outcome,
    aggregates,
    buildGraph,
    ask,
    setModel,
    cancel,
  };
}
