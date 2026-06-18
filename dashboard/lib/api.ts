export const fetcher = async (url: string) => {
  const res = await fetch(url);
  return res.json();
};

export const swrConfig = {
  refreshInterval: 30000,
  revalidateOnFocus: false,
  keepPreviousData: true,
} as const;

export function fmtUSD(n: number | null | undefined, opts?: { sign?: boolean }): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const prefix = n < 0 ? "-$" : opts?.sign ? "+$" : "$";
  return `${prefix}${formatted}`;
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}
