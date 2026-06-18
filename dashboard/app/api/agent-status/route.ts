import { NextResponse } from "next/server";
import { callTool } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await callTool("agent_status");
  if (error || !data) {
    return NextResponse.json({ error: error ?? "no data", stale: true });
  }
  return NextResponse.json(data);
}
