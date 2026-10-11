import { withLogQuery } from "@/lib/logs/http";
import { readErrorGroups } from "@/lib/logs/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLogQuery(request, async (environment, query, params) => ({
    items: await readErrorGroups(environment, query, params),
  }));
}
