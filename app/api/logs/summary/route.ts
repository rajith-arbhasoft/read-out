import { withLogQuery } from "@/lib/logs/http";
import { readSummary } from "@/lib/logs/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLogQuery(request, (environment, query) => readSummary(environment, query));
}
