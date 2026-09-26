"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { SIDEBAR_WIDTH_RANGE } from "@/lib/constants";
import { useSettingsStore } from "@/stores/useSettingsStore";

/** Resizable assistant rail with the same width stored in the preferences cookie. */
export function useResizablePanel() {
  const width = useSettingsStore((state) => state.sidebarWidth);
  const setWidth = useSettingsStore((state) => state.setSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);

  const stop = useCallback(() => setIsResizing(false), []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onPointerMove = (event: PointerEvent) => {
      // The assistant is on the right, so moving left makes it wider.
      const next = window.innerWidth - event.clientX;
      setWidth(next);
    };
    const onPointerUp = () => stop();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("blur", onPointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", onPointerUp);
    };
  }, [isResizing, setWidth, stop]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? 1 : -1;
        setWidth(width + direction * 24);
      }
      if (event.key === "Home") {
        event.preventDefault();
        setWidth(SIDEBAR_WIDTH_RANGE.min);
      }
      if (event.key === "End") {
        event.preventDefault();
        setWidth(SIDEBAR_WIDTH_RANGE.max);
      }
    },
    [setWidth, width],
  );

  const separatorProps = useMemo(
    () => ({
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-label": "Resize assistant panel",
      "aria-valuemin": SIDEBAR_WIDTH_RANGE.min,
      "aria-valuemax": SIDEBAR_WIDTH_RANGE.max,
      "aria-valuenow": width,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
    }),
    [onKeyDown, onPointerDown, width],
  );

  return {
    width: Math.min(SIDEBAR_WIDTH_RANGE.max, Math.max(SIDEBAR_WIDTH_RANGE.min, width)),
    isResizing,
    separatorProps,
    startResize: onPointerDown,
  };
}
