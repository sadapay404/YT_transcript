import { TranStudioWordmark } from "@/components/layout/TranStudioLogo";

const CREDITS = ["Idea By:", "Design By:", "Executed By:"] as const;

/** A quiet, always-visible signature at the end of every product surface. */
export function CreditsFooter() {
  return (
    <footer className="border-t border-line bg-canvas/70 px-4 py-3 backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center gap-2.5 sm:flex-row sm:justify-between">
        <TranStudioWordmark />

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px] text-ink-soft">
          {CREDITS.map((label) => (
            <p key={label} className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-semibold tracking-[0.14em] text-accent uppercase">
                {label}
              </span>
              Mubashir
            </p>
          ))}
        </div>
      </div>
    </footer>
  );
}
