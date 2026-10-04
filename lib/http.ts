import { listEnvironments } from "@/lib/config/environments";
import { QueryRejectedError } from "@/lib/sql/errors";
import { validateReadOnlySql } from "@/lib/sql/validator";

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return jsonError("Request body must be JSON.", 400);
  }
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export function requireEnvironment(value: unknown): string | Response {
  if (typeof value !== "string" || !value.trim()) {
    return jsonError("Choose an environment.", 400);
  }
  if (!listEnvironments().includes(value)) {
    return jsonError("Unknown environment.", 400);
  }
  return value;
}

export function requireQuery(value: unknown): string | Response {
  if (typeof value !== "string") return jsonError("Enter a SQL query.", 400);
  try {
    validateReadOnlySql(value);
  } catch (error) {
    if (error instanceof QueryRejectedError) return jsonError(error.message, error.status);
    return jsonError("Only a single read-only SELECT statement is allowed.", 400);
  }
  return value;
}

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2_000;

export function requireTitle(value: unknown): string | Response {
  if (typeof value !== "string" || !value.trim()) return jsonError("Enter a title.", 400);
  const title = value.trim();
  if (title.length > TITLE_MAX) return jsonError("The title is too long.", 400);
  return title;
}

export function optionalDescription(value: unknown): string | null | Response {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return jsonError("Description must be text.", 400);
  const description = value.trim();
  if (!description) return null;
  if (description.length > DESCRIPTION_MAX) return jsonError("The description is too long.", 400);
  return description;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireId(id: string): string | Response {
  if (!UUID.test(id)) return jsonError("Saved query not found.", 404);
  return id;
}
