import { environmentCatalog } from "@/lib/config/environments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(environmentCatalog());
}
