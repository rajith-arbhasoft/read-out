import { randomUUID } from "node:crypto";
import {
  isResponse,
  jsonError,
  optionalDescription,
  readJson,
  requireEnvironment,
  requireQuery,
  requireTitle,
} from "@/lib/http";
import { insertSavedQuery, listSavedQueries } from "@/lib/store/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    return Response.json({ savedQueries: listSavedQueries() });
  } catch {
    return jsonError("Saved queries are unavailable.", 500);
  }
}

export async function POST(request: Request) {
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
    const saved = insertSavedQuery({
      id: randomUUID(),
      title,
      description,
      environment,
      query,
      now: new Date().toISOString(),
    });
    return Response.json(saved, { status: 201 });
  } catch {
    return jsonError("Saved queries are unavailable.", 500);
  }
}
