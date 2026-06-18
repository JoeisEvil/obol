const MCP_BASE = process.env.NEXT_PUBLIC_MCP_HTTP_URL || "http://localhost:3001";

export async function callTool<T = unknown>(
  name: string,
  body?: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${MCP_BASE}/tool/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    if (!res.ok) {
      return { data: null, error: `MCP ${name} returned ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) };
  }
}
