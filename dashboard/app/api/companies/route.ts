import { NextResponse } from "next/server";
import { callTool } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await callTool("registry_list_companies");
  if (error || !data) {
    return NextResponse.json({ error: error ?? "no data", stale: true, companies: [], total: 0 });
  }
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { data, error } = await callTool("registry_add_company", body);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "failed to add company", stale: true });
  }
  return NextResponse.json(data);
}
