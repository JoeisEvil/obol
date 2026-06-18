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
  const { data, error } = await callTool("registry_test_connection", body);
  if (error || !data) {
    return NextResponse.json({ error: error ?? "connection test failed", stale: true, valid: false });
  }
  return NextResponse.json(data);
}
