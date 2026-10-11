import { isResponse, requireEnvironment } from "@/lib/http";
import { logErrorResponse, logsDisabled } from "@/lib/logs/http";
import { readImports } from "@/lib/logs/read";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const disabled = logsDisabled();
  if (disabled) return disabled;

  const environment = requireEnvironment(new URL(request.url).searchParams.get("environment"));
  if (isResponse(environment)) return environment;

  try {
    return Response.json({ data: { items: await readImports(environment) } });
  } catch (error) {
    return logErrorResponse(error);
  }
}
