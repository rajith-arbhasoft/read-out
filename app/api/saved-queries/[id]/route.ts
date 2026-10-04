import {
  isResponse,
  jsonError,
  optionalDescription,
  readJson,
  requireEnvironment,
  requireId,
  requireQuery,
  requireTitle,
} from "@/lib/http";
import { deleteSavedQuery, updateSavedQuery } from "@/lib/store/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const { id: rawId } = await context.params;
  const id = requireId(rawId);
  if (isResponse(id)) return id;

  const body = await readJson(request);
  if (isResponse(body)) return body;
  if (!body || typeof body !== "object") return jsonError("Request body must be JSON.", 400);

  const payload = body as {
    title?: unknown;
    description?: unknown;
    environment?: unknown;
    query?: unknown;
  };
  const title = requireTitle(payload.title);
  if (isResponse(title)) return title;
  const description = optionalDescription(payload.description);
  if (isResponse(description)) return description;
  const environment = requireEnvironment(payload.environment);
  if (isResponse(environment)) return environment;
  const query = requireQuery(payload.query);
  if (isResponse(query)) return query;

  try {
    const saved = updateSavedQuery({
      id,
      title,
      description,
      environment,
      query,
      now: new Date().toISOString(),
    });
    if (!saved) return jsonError("Saved query not found.", 404);
    return Response.json(saved);
  } catch {
    return jsonError("Saved queries are unavailable.", 500);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id: rawId } = await context.params;
  const id = requireId(rawId);
  if (isResponse(id)) return id;
  try {
    const removed = deleteSavedQuery(id);
    if (!removed) return jsonError("Saved query not found.", 404);
    return new Response(null, { status: 204 });
  } catch {
    return jsonError("Saved queries are unavailable.", 500);
  }
}
