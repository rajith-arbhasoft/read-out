import { jsonError } from "@/lib/http";
import { listHistory } from "@/lib/store/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    return Response.json({ history: listHistory() });
  } catch {
    return jsonError("Query history is unavailable.", 500);
  }
}
