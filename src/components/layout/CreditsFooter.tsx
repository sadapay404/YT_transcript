import Image from "next/image";

/** A quiet, always-visible signature at the end of every product surface. */
export function CreditsFooter() {
  return (
    <footer className="border-t border-line bg-canvas/70 px-4 py-8 backdrop-blur-sm sm:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xs">
          <Image
            src="/wordmark.png"
            alt="TranStudio by Mubashir"
            width={896}
            height={286}
            className="h-auto w-full max-w-[280px] rounded-xl border border-line"
          />
        </div>

        <div className="grid gap-x-8 gap-y-2 text-[12px] text-ink-soft sm:grid-cols-3 sm:text-right">
          <p>
            <span className="block text-[10px] font-semibold tracking-[0.14em] text-accent uppercase">
              Idea By:
            </span>
            Mubashir
          </p>
          <p>
            <span className="block text-[10px] font-semibold tracking-[0.14em] text-accent uppercase">
              Design By:
            </span>
            Mubashir
          </p>
          <p>
            <span className="block text-[10px] font-semibold tracking-[0.14em] text-accent uppercase">
              Executed By:
            </span>
            Mubashir
          </p>
        </div>
      </div>
    </footer>
  );
}
