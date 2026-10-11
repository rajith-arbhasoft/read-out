import { withLogQuery } from "@/lib/logs/http";
import { readTimeseries } from "@/lib/logs/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLogQuery(request, (environment, query, params) => readTimeseries(environment, query, params));
}
