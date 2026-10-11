"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EnvironmentSelector } from "@/components/EnvironmentSelector";
import type {
  ErrorGroup,
  LogBucket,
  LogDetail,
  LogImport,
  LogListItem,
  LogPoint,
  LogSummary,
  SlowGroup,
} from "@/lib/logs/types";
import type { EnvironmentCatalog } from "@/lib/types";

type Preset = "1h" | "24h" | "7d" | "custom";
type BucketChoice = "auto" | LogBucket;

type Filters = {
  level: string;
  method: string;
  statusCode: string;
  url: string;
  q: string;
};

type LogList = {
  items: LogListItem[];
  page: number;
  limit: number;
  total: number;
};

const EMPTY_FILTERS: Filters = { level: "", method: "", statusCode: "", url: "", q: "" };
const STALE_IMPORT_MS = 15 * 60 * 1000;
const RIYADH = "Asia/Riyadh";

const inputClass =
  "rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function LogDashboard() {
  const [catalog, setCatalog] = useState<EnvironmentCatalog>({
    environments: [],
    confirmEnvironments: [],
    maxRows: 10000,
    logDashboard: false,
  });
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [environment, setEnvironment] = useState("");
  const [preset, setPreset] = useState<Preset>("24h");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [bucket, setBucket] = useState<BucketChoice>("auto");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const [urlDraft, setUrlDraft] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [minMs, setMinMs] = useState("1000");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<LogSummary | null>(null);
  const [points, setPoints] = useState<LogPoint[]>([]);
  const [resolvedBucket, setResolvedBucket] = useState<LogBucket>("hour");
  const [list, setList] = useState<LogList | null>(null);
  const [slow, setSlow] = useState<SlowGroup[]>([]);
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [imports, setImports] = useState<LogImport[]>([]);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);

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
        const range = rangeFor("24h");
        setFrom(range.from);
        setTo(range.to);
        setCustomFrom(toLocalInput(range.from));
        setCustomTo(toLocalInput(range.to));
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
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const current = filtersRef.current;
      if (current.url === urlDraft && current.q === qDraft) return;
      setFilters({ ...current, url: urlDraft, q: qDraft });
      setPage(1);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [urlDraft, qDraft]);

  useEffect(() => {
    if (!catalog.logDashboard || !environment || !from || !to) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const search = sharedSearch(environment, from, to, filters);
    if (bucket !== "auto") search.set("bucket", bucket);

    void Promise.all([
      getData<LogSummary>("/api/logs/summary", sharedSearch(environment, from, to, filters)),
      getData<{ bucket: LogBucket; points: LogPoint[] }>("/api/logs/timeseries", search),
      getData<{ items: ErrorGroup[] }>("/api/logs/groups/errors", sharedSearch(environment, from, to, filters)),
    ])
      .then(([nextSummary, series, nextErrors]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setPoints(series.points);
        setResolvedBucket(series.bucket);
        setErrors(nextErrors.items);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Logs could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bucket, catalog.logDashboard, environment, filters, from, to]);

  useEffect(() => {
    if (!catalog.logDashboard || !environment || !from || !to) return;
    let cancelled = false;
    const search = sharedSearch(environment, from, to, filters);
    if (/^\d+$/.test(minMs)) search.set("minMs", minMs);
    void getData<{ items: SlowGroup[] }>("/api/logs/groups/slow", search)
      .then((payload) => {
        if (!cancelled) setSlow(payload.items);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Slow URLs could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [catalog.logDashboard, environment, filters, from, minMs, to]);

  useEffect(() => {
    if (!catalog.logDashboard || !environment || !from || !to) return;
    let cancelled = false;
    const search = sharedSearch(environment, from, to, filters);
    search.set("page", String(page));
    search.set("limit", "50");
    void getData<LogList>("/api/logs", search)
      .then((payload) => {
        if (!cancelled) setList(payload);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Logs could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [catalog.logDashboard, environment, filters, from, page, to]);

  useEffect(() => {
    if (!catalog.logDashboard || !environment) return;
    let cancelled = false;
    async function load() {
      try {
        const payload = await getData<{ items: LogImport[] }>(
          "/api/logs/imports",
          new URLSearchParams({ environment }),
        );
        if (!cancelled) {
          setImports(payload.items);
          setImportError(null);
        }
      } catch (reason) {
        if (!cancelled) setImportError(reason instanceof Error ? reason.message : "Imports could not be loaded.");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [catalog.logDashboard, environment]);

  useEffect(() => {
    if (!selectedId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
        setDetail(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  function applyPreset(next: Exclude<Preset, "custom">) {
    const range = rangeFor(next);
    setPreset(next);
    setFrom(range.from);
    setTo(range.to);
    setCustomFrom(toLocalInput(range.from));
    setCustomTo(toLocalInput(range.to));
    setPage(1);
    setBucket("auto");
  }

  function applyCustom() {
    const start = new Date(customFrom);
    const end = new Date(customTo);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Enter a valid custom range.");
      return;
    }
    if (start.getTime() >= end.getTime()) {
      setError("The start must be before the end.");
      return;
    }
    if (end.getTime() - start.getTime() > 14 * 24 * 60 * 60 * 1000) {
      setError("The time range cannot be longer than 14 days.");
      return;
    }
    setError(null);
    setPreset("custom");
    setFrom(start.toISOString());
    setTo(end.toISOString());
    setPage(1);
    setBucket("auto");
  }

  function applyUrl(url: string) {
    setUrlDraft(url);
    setFilters((current) => ({ ...current, url }));
    setPage(1);
  }

  async function openLog(id: string) {
    setSelectedId(id);
    setDetail(null);
    setDrawerError(null);
    setDrawerLoading(true);
    try {
      const payload = await getData<LogDetail>(`/api/logs/${id}`, new URLSearchParams({ environment }));
      setDetail(payload);
    } catch (reason) {
      setDrawerError(reason instanceof Error ? reason.message : "The log line could not be loaded.");
    } finally {
      setDrawerLoading(false);
    }
  }

  if (loadingCatalog) {
    return <main className="p-6 text-sm text-muted">Loading…</main>;
  }

  if (catalogError) {
    return <main className="p-6 text-sm text-danger">{catalogError}</main>;
  }

  if (!catalog.logDashboard) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-base font-semibold">Log dashboard</h1>
        <p className="mt-2 text-sm text-muted">
          The log dashboard is turned off. Set SQL_TOOL_ENABLE_LOG_DASHBOARD=true and restart to read logs from the
          selected database.
        </p>
        <a href="/" className="mt-4 inline-block text-sm text-accent hover:underline">
          Back to SQL
        </a>
      </main>
    );
  }

  const pageCount = list ? Math.max(1, Math.ceil(list.total / list.limit)) : 1;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-base font-semibold tracking-tight">Log dashboard</h1>
            <a href="/" className="text-sm text-accent hover:underline">
              SQL
            </a>
          </div>
          <p className="text-xs text-muted">Reads log.logs on the selected environment database</p>
        </div>
        {catalog.environments.length === 0 ? (
          <p className="text-sm text-muted">No database is configured.</p>
        ) : (
          <EnvironmentSelector
          environments={catalog.environments}
          value={environment}
          onChange={(next) => {
            setEnvironment(next);
            setPage(1);
            setSelectedId(null);
            setDetail(null);
          }}
        />
        )}
      </header>

      <div className="flex flex-col gap-4 p-4">
        <ImportStrip items={imports} error={importError} />

        <section className="flex flex-wrap items-end gap-2">
          <PresetButton active={preset === "1h"} onClick={() => applyPreset("1h")}>
            Last 1 hour
          </PresetButton>
          <PresetButton active={preset === "24h"} onClick={() => applyPreset("24h")}>
            Last 24 hours
          </PresetButton>
          <PresetButton active={preset === "7d"} onClick={() => applyPreset("7d")}>
            Last 7 days
          </PresetButton>
          <label className="flex flex-col gap-1 text-xs text-muted">
            From
            <input
              type="datetime-local"
              className={inputClass}
              value={customFrom}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            To
            <input
              type="datetime-local"
              className={inputClass}
              value={customTo}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </label>
          <button type="button" className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink" onClick={applyCustom}>
            Apply range
          </button>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Bucket
            <select
              className={inputClass}
              value={bucket}
              onChange={(event) => setBucket(event.target.value as BucketChoice)}
            >
              <option value="auto">Auto</option>
              <option value="minute">Minute</option>
              <option value="hour">Hour</option>
              <option value="day">Day</option>
            </select>
          </label>
        </section>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Card label="Total" value={summary ? summary.total.toLocaleString() : "—"} />
          <Card label="Errors" value={summary ? summary.error.toLocaleString() : "—"} tone="danger" />
          <Card label="Warnings" value={summary ? summary.warn.toLocaleString() : "—"} tone="warn" />
          <Card label="Error rate" value={summary ? formatRate(summary.errorRate) : "—"} />
          <Card label="p95" value={summary ? formatMs(summary.p95ResponseTimeMs) : "—"} />
        </section>

        {summary ? (
          <p className="text-xs text-muted">
            Debug {summary.debug.toLocaleString()} · Info {summary.info.toLocaleString()} · Fatal{" "}
            {summary.fatal.toLocaleString()} · 4xx {summary.http4xx.toLocaleString()} · 5xx{" "}
            {summary.http5xx.toLocaleString()} · Avg {formatMs(summary.avgResponseTimeMs)}
            {loading ? " · Updating…" : ""}
          </p>
        ) : null}

        <section className="rounded-md border border-line bg-panel p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Volume</h2>
            <p className="text-xs text-muted">Buckets in Asia/Riyadh · {resolvedBucket}</p>
          </div>
          <LogChart points={points} bucket={resolvedBucket} />
        </section>

        <section className="flex flex-wrap items-end gap-2">
          <FilterSelect
            label="Level"
            value={filters.level}
            onChange={(level) => {
              setFilters((current) => ({ ...current, level }));
              setPage(1);
            }}
            options={["", "debug", "info", "warn", "error", "fatal"]}
          />
          <FilterSelect
            label="Method"
            value={filters.method}
            onChange={(method) => {
              setFilters((current) => ({ ...current, method }));
              setPage(1);
            }}
            options={["", "GET", "POST", "PUT", "PATCH", "DELETE"]}
          />
          <FilterSelect
            label="Status"
            value={filters.statusCode}
            onChange={(statusCode) => {
              setFilters((current) => ({ ...current, statusCode }));
              setPage(1);
            }}
            options={["", "2xx", "3xx", "4xx", "5xx"]}
          />
          <label className="flex flex-col gap-1 text-xs text-muted">
            URL prefix
            <input
              className={`${inputClass} min-w-56`}
              value={urlDraft}
              placeholder="/qc/api/v1/"
              onChange={(event) => setUrlDraft(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Message
            <input
              className={`${inputClass} min-w-56`}
              value={qDraft}
              placeholder="Search message"
              onChange={(event) => setQDraft(event.target.value)}
            />
          </label>
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Logs {list ? `(${list.total.toLocaleString()})` : ""}</h2>
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <span className="text-muted">
                  {page} / {pageCount}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
                  disabled={!list || page * list.limit >= list.total}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
            <div className="overflow-auto rounded-md border border-line">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-panel-2 text-muted">
                  <tr>
                    {["Time", "Level", "Message", "Method", "URL", "Status", "Time ms"].map((heading) => (
                      <th key={heading} className="border-b border-line px-3 py-2 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list?.items.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer odd:bg-panel even:bg-canvas hover:bg-panel-2"
                      tabIndex={0}
                      onClick={() => void openLog(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void openLog(item.id);
                        }
                      }}
                    >
                      <td className="whitespace-nowrap border-b border-line/70 px-3 py-2 font-mono text-xs">
                        {formatTime(item.timestamp)}
                      </td>
                      <td className={`border-b border-line/70 px-3 py-2 ${levelClass(item.level)}`}>{item.level}</td>
                      <td className="max-w-80 truncate border-b border-line/70 px-3 py-2">{item.message}</td>
                      <td className="border-b border-line/70 px-3 py-2">{item.method ?? "—"}</td>
                      <td className="max-w-64 truncate border-b border-line/70 px-3 py-2 font-mono text-xs">
                        {item.url ?? "—"}
                      </td>
                      <td className="border-b border-line/70 px-3 py-2">{item.statusCode ?? "—"}</td>
                      <td className="border-b border-line/70 px-3 py-2">{item.responseTimeMs ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list && list.items.length === 0 ? (
                <p className="px-3 py-6 text-sm text-muted">No log lines in this range.</p>
              ) : null}
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <GroupList
              title="Slow URLs"
              extra={
                <label className="flex items-center gap-2 text-xs text-muted">
                  Min ms
                  <input
                    className={`${inputClass} w-24`}
                    inputMode="numeric"
                    value={minMs}
                    onChange={(event) => setMinMs(event.target.value.replace(/[^\d]/g, ""))}
                  />
                </label>
              }
            >
              {slow.map((item) => (
                <li key={`${item.method ?? ""} ${item.url}`}>
                  <button type="button" className="w-full text-left" onClick={() => applyUrl(item.url)}>
                    <span className="font-mono text-xs text-ink">
                      {item.method ?? "—"} {item.url}
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      max {formatMs(item.maxResponseTimeMs)} · avg {formatMs(item.avgResponseTimeMs)} · {item.count}{" "}
                      calls
                    </span>
                  </button>
                </li>
              ))}
              {slow.length === 0 ? <li className="text-sm text-muted">No slow URLs.</li> : null}
            </GroupList>

            <GroupList title="Error URLs">
              {errors.map((item) => (
                <li key={`${item.method ?? ""} ${item.url}`}>
                  <button type="button" className="w-full text-left" onClick={() => applyUrl(item.url)}>
                    <span className="font-mono text-xs text-ink">
                      {item.method ?? "—"} {item.url}
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {item.count} · last {formatTime(item.lastSeen)}
                    </span>
                  </button>
                </li>
              ))}
              {errors.length === 0 ? <li className="text-sm text-muted">No error URLs.</li> : null}
            </GroupList>
          </aside>
        </div>
      </div>

      {selectedId ? (
        <div className="fixed inset-0 z-20 flex justify-end bg-black/50" onClick={() => setSelectedId(null)}>
          <aside
            className="h-full w-full max-w-xl overflow-auto border-l border-line bg-panel p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Log detail"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium">Log line</h2>
              <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setSelectedId(null)}>
                Close
              </button>
            </div>
            {drawerLoading ? <p className="text-sm text-muted">Loading…</p> : null}
            {drawerError ? <p className="text-sm text-danger">{drawerError}</p> : null}
            {detail ? (
              <div className="flex flex-col gap-4">
                <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-1 text-sm">
                  <dt className="text-muted">Time</dt>
                  <dd>{formatTime(detail.timestamp)}</dd>
                  <dt className="text-muted">Level</dt>
                  <dd className={levelClass(detail.level)}>{detail.level}</dd>
                  <dt className="text-muted">Message</dt>
                  <dd>{detail.message}</dd>
                  <dt className="text-muted">Request</dt>
                  <dd>
                    {detail.method ?? "—"} {detail.url ?? ""}
                  </dd>
                  <dt className="text-muted">Status</dt>
                  <dd>{detail.statusCode ?? "—"}</dd>
                  <dt className="text-muted">Duration</dt>
                  <dd>{detail.responseTimeMs == null ? "—" : formatMs(detail.responseTimeMs)}</dd>
                  <dt className="text-muted">File</dt>
                  <dd className="font-mono text-xs">{detail.fileName}</dd>
                </dl>
                <JsonBlock label="req" value={detail.req} />
                <JsonBlock label="res" value={detail.res} />
                <JsonBlock label="error" value={detail.error} />
                <JsonBlock label="context" value={detail.context} />
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ImportStrip({ items, error }: { items: LogImport[]; error: string | null }) {
  return (
    <section className="rounded-md border border-line bg-panel px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-muted uppercase">Imports</h2>
        <span className="text-xs text-muted">Refreshes every minute</span>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {items.length === 0 && !error ? <p className="text-sm text-muted">No import trackers.</p> : null}
      <ul className="flex gap-2 overflow-x-auto">
        {items.map((item) => {
          const stale = isStaleImport(item);
          return (
            <li
              key={item.fileName}
              className="min-w-56 rounded-md border border-line bg-canvas px-3 py-2"
              title={item.fileName}
            >
              <p className="truncate font-mono text-xs">{item.fileName}</p>
              <p className={`text-xs ${item.status === "failed" || stale ? "text-danger" : item.status === "processing" ? "text-warn" : "text-ok"}`}>
                {item.status}
                {stale ? " · stalled" : ""}
              </p>
              <p className="text-xs text-muted">
                {item.lastProcessedAt ? formatTime(item.lastProcessedAt) : "not processed"} · offset {item.offset}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function LogChart({ points, bucket }: { points: LogPoint[]; bucket: LogBucket }) {
  if (points.length === 0) return <p className="text-sm text-muted">No buckets in this range.</p>;
  if (points.length > 500) {
    return <p className="text-sm text-muted">This bucket is too fine for the range. Choose hour or day.</p>;
  }

  const width = Math.max(points.length * 16, 280);
  const height = 180;
  const barWidth = width / points.length;
  const max = Math.max(1, ...points.map((point) => point.debug + point.info + point.warn + point.error));
  const labelEvery = Math.ceil(points.length / 8);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 28}`} className="h-52 min-w-full" role="img" aria-label="Log volume">
        {points.map((point, index) => {
          const errorOnly = Math.max(0, point.error - point.fatal);
          const parts = [
            { value: point.debug, color: "#6e7c8a" },
            { value: point.info, color: "#3aa892" },
            { value: point.warn, color: "#f0b429" },
            { value: errorOnly, color: "#f07178" },
            { value: point.fatal, color: "#c43d4b" },
          ];
          let y = height;
          const x = index * barWidth;
          return (
            <g key={point.at}>
              <title>
                {formatBucket(point.at, bucket)}
                {`\ndebug ${point.debug}\ninfo ${point.info}\nwarn ${point.warn}\nerror ${point.error}\nfatal ${point.fatal}`}
              </title>
              {parts.map((part) => {
                const barHeight = (part.value / max) * (height - 4);
                y -= barHeight;
                return <rect key={part.color} x={x + 1} y={y} width={Math.max(barWidth - 2, 1)} height={barHeight} fill={part.color} />;
              })}
              {index % labelEvery === 0 ? (
                <text x={x} y={height + 16} fill="#8e9ba8" fontSize="10">
                  {formatBucket(point.at, bucket)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        <Legend color="#6e7c8a" label="debug" />
        <Legend color="#3aa892" label="info" />
        <Legend color="#f0b429" label="warn" />
        <Legend color="#f07178" label="error" />
        <Legend color="#c43d4b" label="fatal" />
      </div>
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warn" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <article className="rounded-md border border-line bg-panel px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option || "any"} value={option}>
            {option || "Any"}
          </option>
        ))}
      </select>
    </label>
  );
}

function GroupList({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-line bg-panel p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {extra}
      </div>
      <ul className="flex max-h-80 flex-col gap-3 overflow-auto">{children}</ul>
    </section>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">{label}</h3>
      <pre className="overflow-auto rounded-md border border-line bg-canvas p-3 font-mono text-xs leading-5">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function PresetButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-2 text-sm ${active ? "border-accent bg-accent text-accent-ink" : "border-line text-ink"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function sharedSearch(environment: string, from: string, to: string, filters: Filters): URLSearchParams {
  const search = new URLSearchParams({ environment, from, to });
  if (filters.level) search.set("level", filters.level);
  if (filters.method) search.set("method", filters.method);
  if (filters.statusCode) search.set("statusCode", filters.statusCode);
  if (filters.url) search.set("url", filters.url);
  if (filters.q) search.set("q", filters.q);
  return search;
}

async function getData<T>(path: string, search: URLSearchParams): Promise<T> {
  const response = await fetch(`${path}?${search.toString()}`);
  const body = (await response.json()) as { data?: T; error?: string };
  if (!response.ok) throw new Error(body.error ?? "The request could not be completed.");
  if (body.data === undefined) throw new Error("The request could not be completed.");
  return body.data;
}

function rangeFor(preset: Exclude<Preset, "custom">, now = new Date()): { from: string; to: string } {
  const span = preset === "1h" ? 60 * 60 * 1000 : preset === "24h" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return { from: new Date(now.getTime() - span).toISOString(), to: now.toISOString() };
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function formatBucket(iso: string, bucket: LogBucket): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH,
    month: "short",
    day: "2-digit",
    hour: bucket === "day" ? undefined : "2-digit",
    minute: bucket === "minute" ? "2-digit" : undefined,
    hourCycle: "h23",
  }).format(new Date(iso));
}

function formatMs(value: number): string {
  return `${value.toLocaleString()} ms`;
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

function levelClass(level: string): string {
  if (level === "fatal" || level === "error") return "text-danger";
  if (level === "warn") return "text-warn";
  if (level === "info") return "text-ok";
  return "text-muted";
}

function isStaleImport(item: LogImport): boolean {
  if (item.status !== "processing") return false;
  if (!item.lastProcessedAt) return true;
  return Date.now() - new Date(item.lastProcessedAt).getTime() > STALE_IMPORT_MS;
}
