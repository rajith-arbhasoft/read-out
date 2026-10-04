"use client";

import { useCallback, useEffect, useState } from "react";
import { EnvironmentSelector } from "@/components/EnvironmentSelector";
import { QueryHistory } from "@/components/QueryHistory";
import { QueryResults } from "@/components/QueryResults";
import { SavedQueries } from "@/components/SavedQueries";
import { SqlEditor } from "@/components/SqlEditor";
import type { EnvironmentCatalog, HistoryEntry, QueryResult, SavedQuery } from "@/lib/types";

type SideTab = "saved" | "history";

export function SqlConsole() {
  const [catalog, setCatalog] = useState<EnvironmentCatalog>({
    environments: [],
    confirmEnvironments: [],
    maxRows: 10000,
  });
  const [environment, setEnvironment] = useState("");
  const [sql, setSql] = useState("");
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<SideTab>("saved");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ environment: string; query: string } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/history");
    if (!response.ok) return;
    const payload = (await response.json()) as { history: HistoryEntry[] };
    setHistory(payload.history);
  }, []);

  const loadSaved = useCallback(async () => {
    const response = await fetch("/api/saved-queries");
    if (!response.ok) return;
    const payload = (await response.json()) as { savedQueries: SavedQuery[] };
    setSavedQueries(payload.savedQueries);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/environments");
        if (!response.ok) throw new Error("unavailable");
        const payload = (await response.json()) as EnvironmentCatalog;
        if (cancelled) return;
        setCatalog(payload);
        setEnvironment(payload.environments[0] ?? "");
        await Promise.all([loadSaved(), loadHistory()]);
      } catch {
        if (!cancelled) setCatalogError("Environments could not be loaded.");
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadHistory, loadSaved]);

  const runQuery = useCallback(
    async (targetEnvironment: string, query: string) => {
      setExecuting(true);
      setError(null);
      setResult(null);
      try {
        const response = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ environment: targetEnvironment, query }),
        });
        const payload = (await response.json()) as QueryResult & { error?: string };
        if (!response.ok) {
          setError(payload.error ?? "The query could not be completed.");
          return;
        }
        setResult(payload);
      } catch {
        setError("The query could not be completed.");
      } finally {
        setExecuting(false);
        void loadHistory();
      }
    },
    [loadHistory],
  );

  function requestExecute(targetEnvironment = environment, query = sql) {
    if (!targetEnvironment || !query.trim() || executing) return;
    if (catalog.confirmEnvironments.includes(targetEnvironment)) {
      setConfirming({ environment: targetEnvironment, query });
      return;
    }
    void runQuery(targetEnvironment, query);
  }

  function loadSavedQuery(query: SavedQuery) {
    setActiveSavedId(query.id);
    setEnvironment(query.environment);
    setSql(query.query);
    setError(null);
  }

  async function removeSavedQuery(query: SavedQuery) {
    if (!window.confirm(`Delete saved query “${query.title}”?`)) return;
    const response = await fetch(`/api/saved-queries/${query.id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 204) {
      setError("The saved query could not be deleted.");
      return;
    }
    if (activeSavedId === query.id) setActiveSavedId(null);
    await loadSaved();
  }

  const needsConfirm = catalog.confirmEnvironments.includes(environment);
  const activeSaved = savedQueries.find((query) => query.id === activeSavedId) ?? null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">SQL Tool</h1>
          <p className="text-xs text-muted">Read-only queries against configured databases</p>
        </div>
        <EnvironmentSelector
          environments={catalog.environments}
          value={environment}
          disabled={loadingCatalog || executing}
          onChange={(next) => {
            setEnvironment(next);
            setActiveSavedId(null);
          }}
        />
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3 border-b border-line p-4 lg:border-r lg:border-b-0">
          <div className="flex rounded-md border border-line p-1">
            <TabButton active={sideTab === "saved"} onClick={() => setSideTab("saved")}>
              Saved
            </TabButton>
            <TabButton active={sideTab === "history"} onClick={() => setSideTab("history")}>
              History
            </TabButton>
          </div>
          <div className="max-h-[40vh] overflow-auto lg:max-h-[calc(100vh-8rem)]">
            {sideTab === "saved" ? (
              <SavedQueries
                queries={savedQueries}
                activeId={activeSavedId}
                onLoad={loadSavedQuery}
                onRun={(query) => {
                  loadSavedQuery(query);
                  requestExecute(query.environment, query.query);
                }}
                onDelete={(query) => void removeSavedQuery(query)}
              />
            ) : (
              <QueryHistory
                entries={history}
                savedQueries={savedQueries}
                onLoad={(entry) => {
                  setEnvironment(entry.environment);
                  setSql(entry.query);
                  setActiveSavedId(null);
                  setError(null);
                }}
              />
            )}
          </div>
        </aside>

        <main className="flex flex-col gap-3 p-4">
          {loadingCatalog ? <p className="text-sm text-muted">Loading environments…</p> : null}
          {catalogError ? (
            <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{catalogError}</div>
          ) : null}
          {!loadingCatalog && catalog.environments.length === 0 ? (
            <div className="rounded-md border border-line bg-panel px-3 py-3 text-sm text-muted">
              No databases are configured. An administrator needs to set <span className="font-mono">DATABASE_&lt;NAME&gt;</span> on
              the server and restart the application.
            </div>
          ) : null}
          {needsConfirm ? (
            <div className="rounded-md border border-warn/50 bg-warn-bg px-3 py-2 text-sm text-warn">
              {environment.toUpperCase() === "PROD"
                ? "⚠ You are querying PRODUCTION"
                : `⚠ You are querying ${environment}`}
            </div>
          ) : null}

          <SqlEditor value={sql} disabled={executing} onChange={setSql} onExecute={() => requestExecute()} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
              disabled={executing || !environment || !sql.trim()}
              onClick={() => requestExecute()}
            >
              {executing ? "Running…" : "Execute"}
            </button>
            <button
              type="button"
              className="rounded-md border border-line px-4 py-2 text-sm text-ink disabled:opacity-50"
              disabled={executing || !sql.trim()}
              onClick={() => {
                setSaveError(null);
                setSaveOpen(true);
              }}
            >
              {activeSaved ? "Update" : "Save"}
            </button>
            <button
              type="button"
              className="rounded-md border border-line px-4 py-2 text-sm text-muted hover:text-ink"
              onClick={() => {
                setSql("");
                setResult(null);
                setError(null);
                setActiveSavedId(null);
              }}
            >
              Clear
            </button>
            <span className="text-xs text-muted">Ctrl/Cmd+Enter to execute</span>
            <span className="text-xs text-muted">Up to {catalog.maxRows.toLocaleString()} rows</span>
          </div>

          <QueryResults result={result} error={error} executing={executing} />
        </main>
      </div>

      {confirming ? (
        <Modal title="Confirm execution" onClose={() => setConfirming(null)}>
          <p className="text-sm">
            {confirming.environment.toUpperCase() === "PROD"
              ? "You are about to execute a query against PRODUCTION."
              : `You are about to execute a query against ${confirming.environment}.`}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-line px-3 py-2 text-sm"
              onClick={() => setConfirming(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-warn px-3 py-2 text-sm font-medium text-black"
              onClick={() => {
                const pending = confirming;
                setConfirming(null);
                void runQuery(pending.environment, pending.query);
              }}
            >
              Execute
            </button>
          </div>
        </Modal>
      ) : null}

      {saveOpen ? (
        <SaveDialog
          key={activeSavedId ?? "new"}
          active={activeSaved}
          environment={environment}
          query={sql}
          saving={saving}
          error={saveError}
          onClose={() => setSaveOpen(false)}
          onSubmit={async (input) => {
            setSaving(true);
            setSaveError(null);
            try {
              const response = await fetch(input.id ? `/api/saved-queries/${input.id}` : "/api/saved-queries", {
                method: input.id ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: input.title,
                  description: input.description,
                  environment,
                  query: sql,
                }),
              });
              const payload = (await response.json().catch(() => ({}))) as SavedQuery & { error?: string };
              if (!response.ok) {
                setSaveError(payload.error ?? "The query could not be saved.");
                return;
              }
              setActiveSavedId(payload.id);
              setSaveOpen(false);
              await loadSaved();
            } catch {
              setSaveError("The query could not be saved.");
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className={`flex-1 rounded px-3 py-1.5 text-sm ${active ? "bg-panel-2 text-ink" : "text-muted"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-md rounded-lg border border-line bg-panel p-4 shadow-2xl"
      >
        <h2 id="dialog-title" className="text-base font-semibold">
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function SaveDialog({
  active,
  environment,
  query,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  active: SavedQuery | null;
  environment: string;
  query: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { id?: string; title: string; description: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(active?.title ?? "");
  const [description, setDescription] = useState(active?.description ?? "");

  return (
    <Modal title={active ? "Update saved query" : "Save query"} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit({ id: active?.id, title, description });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            className="rounded-md border border-line bg-panel-2 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={200}
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea
            className="min-h-20 rounded-md border border-line bg-panel-2 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
          />
        </label>
        <p className="text-xs text-muted">
          Environment {environment}. The current SQL is saved and checked again every time it runs.
        </p>
        <pre className="max-h-28 overflow-auto rounded-md bg-canvas px-3 py-2 font-mono text-xs text-muted">{query}</pre>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-md border border-line px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          {active ? (
            <button
              type="button"
              className="rounded-md border border-line px-3 py-2 text-sm"
              disabled={saving}
              onClick={() => void onSubmit({ title, description })}
            >
              Save as new
            </button>
          ) : null}
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
            disabled={saving || !title.trim()}
          >
            {saving ? "Saving…" : active ? "Update" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
