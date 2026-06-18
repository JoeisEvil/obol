import CompanySidebar from "@/components/CompanySidebar";
import PortfolioView from "@/components/PortfolioView";
import ChatInterface from "@/components/ChatInterface";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="shell">
      <CompanySidebar active="portfolio" />
      <main className="main">
        <div className="topbar">
          <h1>Ledger Portfolio</h1>
          <span className="sub">FINANCIAL OS // CONSOLE</span>
        </div>
        <PortfolioView />
        <div className="section">
          <div className="section-head">Forecaster // Portfolio</div>
          <ChatInterface scope="portfolio" />
        </div>
      </main>
    </div>
  );
}
