import { AppShell } from "@/components/layout/AppShell";
import { LandingView } from "@/components/landing/LandingView";
import { Workspace } from "@/components/workspace/Workspace";

export default function Home() {
  return (
    <AppShell>
      {/* The landing first — hero, view-mode preview, themes, typography and
       *  the clip palette — then the studio itself: paste a link in the hero
       *  and the transcript mounts right below. */}
      <LandingView />
      <Workspace />
    </AppShell>
  );
}
