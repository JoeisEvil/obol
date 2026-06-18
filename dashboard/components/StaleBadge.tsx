export default function StaleBadge() {
  return <span className="stale-badge">Unreconciled</span>;
}

export function RuledShimmer({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ marginTop: 22 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ruled-shimmer shimmer" />
      ))}
    </div>
  );
}
