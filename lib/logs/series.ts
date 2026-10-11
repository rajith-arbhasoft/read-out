import type { LogBucket, LogPoint } from "@/lib/logs/types";

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export type BucketCounts = {
  at: Date;
  debug: number;
  info: number;
  warn: number;
  error: number;
  fatal: number;
};

export function bucketStart(date: Date, bucket: LogBucket): Date {
  const shifted = new Date(date.getTime() + RIYADH_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const localMs =
    bucket === "day"
      ? Date.UTC(year, month, day)
      : bucket === "hour"
        ? Date.UTC(year, month, day, hour)
        : Date.UTC(year, month, day, hour, minute);
  return new Date(localMs - RIYADH_OFFSET_MS);
}

export function addBucket(date: Date, bucket: LogBucket): Date {
  const step = bucket === "minute" ? 60_000 : bucket === "hour" ? 3_600_000 : 86_400_000;
  return new Date(date.getTime() + step);
}

export function fillBuckets(from: Date, to: Date, bucket: LogBucket, rows: BucketCounts[]): LogPoint[] {
  const byStart = new Map<number, BucketCounts>();
  for (const row of rows) {
    byStart.set(bucketStart(row.at, bucket).getTime(), row);
  }

  const points: LogPoint[] = [];
  for (
    let cursor = bucketStart(from, bucket);
    cursor.getTime() < to.getTime();
    cursor = addBucket(cursor, bucket)
  ) {
    const row = byStart.get(cursor.getTime());
    points.push({
      at: cursor.toISOString(),
      debug: row?.debug ?? 0,
      info: row?.info ?? 0,
      warn: row?.warn ?? 0,
      error: row?.error ?? 0,
      fatal: row?.fatal ?? 0,
    });
  }
  return points;
}
