import Link from "next/link";

export default function SubNav({
  scope,
  active,
}: {
  scope: "portfolio" | string;
  active: "overview" | "budget" | "growth";
}) {
  const base = scope === "portfolio" ? "" : `/${scope}`;
  const overviewHref = scope === "portfolio" ? "/" : `/${scope}`;
  return (
    <nav className="subnav">
      <Link href={overviewHref} className={active === "overview" ? "on" : ""}>
        Overview
      </Link>
      <Link href={`${base}/budget`} className={active === "budget" ? "on" : ""}>
        Budget
      </Link>
      <Link href={`${base}/growth`} className={active === "growth" ? "on" : ""}>
        Growth
      </Link>
    </nav>
  );
}
