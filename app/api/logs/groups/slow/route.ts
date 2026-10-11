import { withLogQuery } from "@/lib/logs/http";
import { readSlowGroups } from "@/lib/logs/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLogQuery(request, async (environment, query, params) => ({
    items: await readSlowGroups(environment, query, params),
  }));
}
