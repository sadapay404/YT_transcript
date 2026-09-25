import type { Metadata } from "next";

import { AppShell } from "@/components/layout/AppShell";
import { StatusDashboard } from "@/components/status/StatusDashboard";

export const metadata: Metadata = {
  title: "System status",
  description:
    "Live diagnostics for TranStudio: environment, caption scraping reachability, Gemini API reachability and build self-tests.",
  robots: { index: false, follow: false },
};

export default function StatusPage() {
  return (
    <AppShell>
      <StatusDashboard />
    </AppShell>
  );
}
