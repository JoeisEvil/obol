import { NextResponse } from "next/server";
import { callTool } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data, error } = await callTool("growth_view", { scope: id });
  if (error || !data) {
    return NextResponse.json({ error: error ?? "no data", stale: true });
  }
  return NextResponse.json(data);
}
