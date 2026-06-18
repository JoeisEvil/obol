import type { ReactNode } from "react";

export default function Masthead({
  title,
  crumb,
  metaRight,
}: {
  title: string;
  crumb: string;
  metaRight: ReactNode;
}) {
  return (
    <div className="mast">
      <div className="title">
        <h1>{title}</h1>
        <span className="crumb">{crumb}</span>
      </div>
      <div className="meta">{metaRight}</div>
    </div>
  );
}
