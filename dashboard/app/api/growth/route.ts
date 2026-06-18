import { NextResponse } from "next/server";
import { callTool } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") || "portfolio";
  const { data, error } = await callTool("growth_view", { scope });
  if (error || !data) {
    return NextResponse.json({ error: error ?? "no data", stale: true });
  }
  return NextResponse.json(data);
}
