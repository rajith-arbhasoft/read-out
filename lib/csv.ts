export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((column) => csvField(column)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvField(row[column])).join(","));
  }
  return lines.join("\r\n");
}

export function csvFileName(environment: string, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const name = environment.replace(/[^A-Za-z0-9_-]/g, "") || "query";
  return `${name.toLowerCase()}-query-${stamp}.csv`;
}

function csvField(value: unknown): string {
  const text = fieldText(value);
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function fieldText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
