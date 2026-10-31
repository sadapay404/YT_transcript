"use client";

import { AuroraBackdrop } from "@/components/layout/AuroraBackdrop";
import { CreditsFooter } from "@/components/layout/CreditsFooter";
import { StudioHeader } from "@/components/layout/StudioHeader";

/**
 * Root chrome: ambient backdrop + sticky header + a full-height content area.
 * `isolation: isolate` keeps the aurora's negative z-index inside the shell.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <AuroraBackdrop />
      <StudioHeader />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <CreditsFooter />
    </div>
  );
}
