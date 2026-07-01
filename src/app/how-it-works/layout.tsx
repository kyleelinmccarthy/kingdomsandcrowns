import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

export default function HowItWorksLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-[linear-gradient(180deg,#060c1a_0%,#090f1f_50%,#0c1525_100%)] text-foreground">
      <MarketingHeader active="how-it-works" />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
