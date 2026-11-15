export type ParsedMemoryMetrics = {
  rssMb: number;
  heapTotalMb: number;
  heapUsedMb: number;
  externalMb: number;
};

export type ParsedPerformanceMetrics = Record<string, number>;

/** Parses `rss=209.58 MBMB heapUsed=70.44 MBMB` style Node memory log lines. */
export function parseServerMemoryMessage(message: string): ParsedMemoryMetrics | null {
  if (!message.toLowerCase().includes("server-memory")) return null;
  const values = parseNumericFields(message);
  if (
    values.rss == null ||
    values.heapTotal == null ||
    values.heapUsed == null ||
    values.external == null
  ) {
    return null;
  }
  return {
    rssMb: values.rss,
    heapTotalMb: values.heapTotal,
    heapUsedMb: values.heapUsed,
    externalMb: values.external,
  };
}

/** Parses latest `server-performance` snapshot lines (generic key=value numbers). */
export function parseServerPerformanceMessage(message: string): ParsedPerformanceMetrics | null {
  if (!message.toLowerCase().includes("server-performance")) return null;
  const values = parseNumericFields(message);
  const keys = Object.keys(values);
  if (keys.length === 0) return null;
  return values;
}

function parseNumericFields(message: string): Record<string, number> {
  const out: Record<string, number> = {};
  const pattern = /([a-zA-Z_][\w]*)\s*=\s*([\d.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(message)) !== null) {
    const key = match[1] ?? "";
    const parsed = Number(match[2]);
    if (key && Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}