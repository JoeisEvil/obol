"use client";

import { use } from "react";
import BudgetView from "@/components/BudgetView";

export default function Page({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = use(params);
  return <BudgetView scope={companyId} />;
}
