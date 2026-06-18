"use client";

import { useEffect, useRef, useState } from "react";

export default function RunningBalance({ value }: { value: string }) {
  const last = useRef<string | null>(null);
  const [penned, setPenned] = useState(false);

  useEffect(() => {
    if (last.current !== null && last.current !== value) {
      setPenned(true);
      const t = setTimeout(() => setPenned(false), 720);
      last.current = value;
      return () => clearTimeout(t);
    }
    last.current = value;
  }, [value]);

  return <div className={`val mono g${penned ? " penned" : ""}`}>{value}</div>;
}
