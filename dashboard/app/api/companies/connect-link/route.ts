import { NextResponse } from "next/server";
import { callTool } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { data, error } = await callTool("registry_generate_connect_link", body);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "could not generate connect link", stale: true });
  }
  return NextResponse.json(data);
}
