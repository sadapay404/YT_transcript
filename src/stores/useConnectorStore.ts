"use client";

/**
 * Whether the TranStudio Connector add-on is installed in this browser.
 * Checked lazily (one postMessage round-trip) and shared by every component
 * that offers the add-on, so they never disagree.
 */
import { create } from "zustand";

import { detectConnector } from "@/lib/connector/client";

export type ConnectorStatus = "unknown" | "checking" | "installed" | "missing";

interface ConnectorState {
  status: ConnectorStatus;
  version: string | null;
  check: (force?: boolean) => Promise<void>;
}

export const useConnectorStore = create<ConnectorState>((set, get) => ({
  status: "unknown",
  version: null,
  check: async (force = false) => {
    const current = get().status;
    if (!force && (current === "checking" || current === "installed")) return;
    set({ status: "checking" });
    const version = await detectConnector(600, force);
    set(version ? { status: "installed", version } : { status: "missing", version: null });
  },
}));
