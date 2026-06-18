"use client";

import { use } from "react";
import GrowthView from "@/components/GrowthView";

export default function Page({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = use(params);
  return <GrowthView scope={companyId} />;
}
