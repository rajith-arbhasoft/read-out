"use client";

import type { HistoryEntry, SavedQuery } from "@/lib/types";

type QueryHistoryProps = {
  entries: HistoryEntry[];
  savedQueries: SavedQuery[];
  onLoad: (entry: HistoryEntry) => void;
};

export function QueryHistory({ entries, savedQueries, onLoad }: QueryHistoryProps) {
  if (entries.length === 0) {
    return <p className="px-1 text-sm text-muted">No queries have been run yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => {
        const title = titleFor(entry, savedQueries);
        return (
          <li key={entry.id}>
            <button
              type="button"
              className="w-full rounded-md border border-line bg-panel px-3 py-2 text-left hover:border-accent/50"
              onClick={() => onLoad(entry)}
            >
              <span className="block text-xs text-muted">{formatTime(entry.timestamp)}</span>
              <span className="mt-1 block text-xs font-medium tracking-wide text-accent">{entry.environment}</span>
              <span className="mt-1 block truncate text-sm">{title}</span>
              <span className={`mt-1 block text-xs ${entry.success ? "text-muted" : "text-danger"}`}>
                {entry.success
                  ? `${entry.rowCount ?? 0} rows · ${formatDuration(entry.durationMs)}`
                  : entry.error ?? "Failed"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function titleFor(entry: HistoryEntry, savedQueries: SavedQuery[]): string {
  const match = savedQueries.find(
    (query) => query.environment === entry.environment && query.query.trim() === entry.query.trim(),
  );
  if (match) return match.title;
  const line = entry.query.trim().split("\n").find((part) => part.trim()) ?? entry.query;
  return line.trim().slice(0, 80);
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(2)} s`;
}
