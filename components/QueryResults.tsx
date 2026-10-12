"use client";

import { useEffect, useRef, useState } from "react";
import { csvFileName, toCsv } from "@/lib/csv";
import type { QueryResult } from "@/lib/types";

type QueryResultsProps = {
  result: QueryResult | null;
  error: string | null;
  executing: boolean;
};

export function QueryResults({ result, error, executing }: QueryResultsProps) {
  const panelRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<{ column: string; text: string } | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const hasTable = Boolean(result && result.columns.length > 0 && result.rowCount > 0);

  useEffect(() => {
    function onChange() {
      setFullScreen(document.fullscreenElement === panelRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!fullScreen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && document.fullscreenElement !== panelRef.current) {
        setFullScreen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreen]);

  async function toggleFullScreen() {
    const panel = panelRef.current;
    if (!panel) return;
    if (document.fullscreenElement === panel) {
      await document.exitFullscreen();
      return;
    }
    if (fullScreen) {
      setFullScreen(false);
      return;
    }
    try {
      await panel.requestFullscreen();
    } catch {
      setFullScreen(true);
    }
  }

  return (
    <section
      ref={panelRef}
      className={`flex min-h-0 flex-1 flex-col gap-3 ${fullScreen ? "fixed inset-0 z-40 bg-canvas p-4" : ""}`}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {executing ? <span>Running query…</span> : null}
        {result ? (
          <>
            <span>
              Rows: <strong className="font-medium text-ink">{result.rowCount.toLocaleString()}</strong>
            </span>
            <span>
              Duration: <strong className="font-medium text-ink">{formatDuration(result.durationMs)}</strong>
            </span>
            <span>
              Environment: <strong className="font-medium text-ink">{result.environment}</strong>
            </span>
          </>
        ) : null}
        </div>
        {hasTable && result ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:bg-panel-2"
              onClick={() => downloadCsv(result)}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:bg-panel-2"
              onClick={() => void toggleFullScreen()}
            >
              {fullScreen ? "Exit full screen" : "Full screen"}
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="whitespace-pre-wrap rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {result && result.rowCount === 0 && !error ? (
        <div className="rounded-md border border-line bg-panel px-3 py-6 text-sm text-muted">
          The query returned no rows.
        </div>
      ) : null}

      {result && result.columns.length > 0 && result.rowCount > 0 ? (
        <div className={`overflow-auto rounded-md border border-line ${fullScreen ? "min-h-0 flex-1" : "max-h-[32rem]"}`}>
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-panel-2">
              <tr>
                {result.columns.map((column) => (
                  <th key={column} className="border-b border-line px-3 py-2 font-medium text-muted">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="odd:bg-panel even:bg-canvas">
                  {result.columns.map((column) => {
                    const text = formatCell(row[column]);
                    const isNull = row[column] === null || row[column] === undefined;
                    return (
                      <td key={column} className="max-w-80 border-b border-line/70 px-3 py-1.5 align-top">
                        <button
                          type="button"
                          className={`block max-w-80 truncate text-left font-mono text-[13px] ${isNull ? "italic text-muted" : "text-ink"}`}
                          onClick={() => setSelected({ column, text })}
                        >
                          {text}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selected.column}
            className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-line bg-panel shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-mono text-sm">{selected.column}</h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-muted hover:bg-panel-2 hover:text-ink"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <pre className="overflow-auto px-4 py-3 font-mono text-sm whitespace-pre-wrap break-all">{selected.text}</pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function downloadCsv(result: QueryResult) {
  const csv = toCsv(result.columns, result.rows);
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csvFileName(result.environment);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
