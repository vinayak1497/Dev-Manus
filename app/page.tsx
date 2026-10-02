import { AISection } from "@/components/landing/AISection";
import { ArchitecturePillars } from "@/components/landing/ArchitecturePillars";
import { ConsolePreview } from "@/components/landing/ConsolePreview";
import { FailureTimeline } from "@/components/landing/FailureTimeline";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { InfraTopology } from "@/components/landing/InfraTopology";
import { MonitoringGrid } from "@/components/landing/MonitoringGrid";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { SecuritySection } from "@/components/landing/SecuritySection";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { TrustStrip } from "@/components/landing/TrustStrip";

export default function LandingPage() {
  return (
    <div id="top">
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <TrustStrip />
        <ProblemSection />
        <HowItWorks />
        <ConsolePreview />
        <MonitoringGrid />
        <FailureTimeline />
        <InfraTopology />
        <SecuritySection />
        <AISection />
        <ArchitecturePillars />
        <FinalCTA />
      </main>
      <SiteFooter />
    </div>
  );
}
