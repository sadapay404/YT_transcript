import type { Metadata } from "next";

import { AppShell } from "@/components/layout/AppShell";
import { WindowsAppPage } from "@/components/download/WindowsAppPage";
import { WINDOWS_RELEASE } from "@/lib/download";

export const metadata: Metadata = {
  title: "TranStudio for Windows",
  description:
    "Download TranStudio for Windows 10 and 11 (64-bit). The desktop build runs the studio on your own machine, so YouTube captions are requested from your network instead of a cloud server.",
  keywords: [
    "transtudio windows",
    "youtube transcript app",
    "desktop transcript downloader",
    "windows transcript app",
  ],
  alternates: { canonical: "/app" },
  openGraph: {
    type: "website",
    title: `TranStudio for Windows — v${WINDOWS_RELEASE.version}`,
    description:
      "The whole studio in a native window: synced transcripts, follow-along reading, NexAI clips and exports.",
    url: "/app",
  },
};

export default function WindowsAppRoute() {
  return (
    <AppShell>
      <WindowsAppPage />
    </AppShell>
  );
}
