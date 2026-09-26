import type { Metadata } from "next";

import { AppShell } from "@/components/layout/AppShell";
import { ConnectorGuide } from "@/components/connector/ConnectorGuide";

export const metadata: Metadata = {
  title: "TranStudio Connector",
  description:
    "A free browser add-on that lets the hosted TranStudio read YouTube captions over your own internet connection.",
};

export default function ConnectorPage() {
  return (
    <AppShell>
      <ConnectorGuide />
    </AppShell>
  );
}
