"use client";

import { AlignLeft, Columns2, RectangleHorizontal } from "lucide-react";

import { VIEW_MODES } from "@/lib/constants";
import type { ViewMode } from "@/lib/types";
import { Segmented } from "@/components/ui/Segmented";
import { useSettingsStore } from "@/stores/useSettingsStore";

const ICONS: Record<ViewMode, React.ReactNode> = {
  split: <Columns2 className="h-3.5 w-3.5" />,
  cinema: <RectangleHorizontal className="h-3.5 w-3.5" />,
  read: <AlignLeft className="h-3.5 w-3.5" />,
};

export function ViewModeSwitch({ compact = false }: { compact?: boolean }) {
  const viewMode = useSettingsStore((s) => s.viewMode);
  const setViewMode = useSettingsStore((s) => s.setViewMode);

  return (
    <Segmented<ViewMode>
      label="View mode"
      size="sm"
      value={viewMode}
      onChange={setViewMode}
      options={VIEW_MODES.map((mode) => ({
        value: mode.id,
        label: compact ? "" : mode.label,
        title: `${mode.label} — ${mode.description}`,
        icon: ICONS[mode.id],
      }))}
    />
  );
}

export function ViewModeDescription() {
  const viewMode = useSettingsStore((s) => s.viewMode);
  const mode = VIEW_MODES.find((m) => m.id === viewMode);
  return <span>{mode?.description}</span>;
}
