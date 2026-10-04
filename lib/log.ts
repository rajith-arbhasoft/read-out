type Outcome = "ok" | "rejected" | "timeout" | "limit" | "busy" | "connection" | "sql" | "error";

export function logOperation(details: {
  environment: string;
  success: boolean;
  durationMs: number;
  rowCount: number | null;
  outcome: Outcome;
}): void {
  console.info(
    `[sql-tool] env=${details.environment} success=${details.success} durationMs=${details.durationMs} rows=${details.rowCount ?? "-"} outcome=${details.outcome}`,
  );
}
