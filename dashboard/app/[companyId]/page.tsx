import CompanySidebar from "@/components/CompanySidebar";
import CompanyView from "@/components/CompanyView";
import ChatInterface from "@/components/ChatInterface";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  return (
    <div className="shell">
      <CompanySidebar active={companyId} />
      <main className="main">
        <CompanyView companyId={companyId} />
        <div className="section">
          <div className="section-head">Forecaster // Company</div>
          <ChatInterface scope="company" companyId={companyId} />
        </div>
      </main>
    </div>
  );
}
