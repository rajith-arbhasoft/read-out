import { jsonError, isResponse, requireEnvironment } from "@/lib/http";
import { logErrorResponse, logsDisabled } from "@/lib/logs/http";
import { readLog } from "@/lib/logs/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const disabled = logsDisabled();
  if (disabled) return disabled;

  const environment = requireEnvironment(new URL(request.url).searchParams.get("environment"));
  if (isResponse(environment)) return environment;

  try {
    const { id } = await context.params;
    const log = await readLog(environment, id);
    if (!log) return jsonError("Log not found.", 404);
    return Response.json({ data: log });
  } catch (error) {
    return logErrorResponse(error);
  }
}
