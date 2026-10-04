"use client";

import type { SavedQuery } from "@/lib/types";

type SavedQueriesProps = {
  queries: SavedQuery[];
  activeId: string | null;
  onLoad: (query: SavedQuery) => void;
  onRun: (query: SavedQuery) => void;
  onDelete: (query: SavedQuery) => void;
};

export function SavedQueries({ queries, activeId, onLoad, onRun, onDelete }: SavedQueriesProps) {
  if (queries.length === 0) {
    return <p className="px-1 text-sm text-muted">No saved queries yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {queries.map((query) => (
        <li
          key={query.id}
          className={`rounded-md border px-3 py-2 ${query.id === activeId ? "border-accent/70 bg-panel-2" : "border-line bg-panel"}`}
        >
          <button type="button" className="w-full text-left" onClick={() => onLoad(query)}>
            <span className="block text-sm font-medium">{query.title}</span>
            <span className="mt-1 block text-xs text-muted">
              {query.environment} · {formatStamp(query.updatedAt)}
            </span>
            {query.description ? (
              <span className="mt-1 block truncate text-xs text-muted">{query.description}</span>
            ) : null}
          </button>
          <div className="mt-2 flex gap-2">
            <button type="button" className="text-xs text-accent hover:underline" onClick={() => onRun(query)}>
              Run
            </button>
            <button type="button" className="text-xs text-muted hover:text-ink hover:underline" onClick={() => onLoad(query)}>
              Load
            </button>
            <button type="button" className="text-xs text-danger hover:underline" onClick={() => onDelete(query)}>
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
