"use client";

/**
 * "Get the free Connector" call-to-action, shown next to the other remedies
 * when YouTube blocked the server. Renders nothing once the add-on is present.
 */
import { useEffect } from "react";
import Link from "next/link";
import { PlugZap } from "lucide-react";

import { cn } from "@/lib/utils";
import { useConnectorStore } from "@/stores/useConnectorStore";

export function ConnectorOffer({ size = "sm", className }: { size?: "sm" | "md"; className?: string }) {
  const status = useConnectorStore((s) => s.status);
  const check = useConnectorStore((s) => s.check);

  useEffect(() => {
    void check();
  }, [check]);

  if (status !== "missing") return null;
  return (
    <Link
      href="/connector"
      data-connector-offer
      title="A free browser add-on that lets TranStudio read captions over your own internet connection"
      className={cn(
        "btn border border-accent/40 bg-accent/10 text-accent hover:bg-accent/15",
        size === "sm" ? "h-8 gap-1.5 px-2.5 text-[11px]" : "h-9 gap-2 px-3",
        className,
      )}
    >
      <PlugZap className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      Fix this for good — free add-on
    </Link>
  );
}
