"use client";

/**
 * Typography Studio — live controls for the reading surface.
 * Everything here writes CSS variables (`--transcript-*`) via the settings
 * store, so the transcript text re-renders nothing while it restyles.
 */
import { RotateCcw, Sparkles } from "lucide-react";

import {
  FONT_OPTIONS,
  FONT_RECOMMENDED,
  FONT_SIZE_RANGE,
  LETTER_SPACING_RANGE,
  LINE_HEIGHT_RANGE,
  MEASURE_RANGE,
} from "@/lib/constants";
import type { FontFamilyId } from "@/lib/types";
import { Segmented } from "@/components/ui/Segmented";
import { Slider } from "@/components/ui/Slider";
import { useSettingsStore } from "@/stores/useSettingsStore";

export function TypographyStudio({ showSample = true }: { showSample?: boolean }) {
  const typography = useSettingsStore((s) => s.typography);
  const setFontFamily = useSettingsStore((s) => s.setFontFamily);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const setLineHeight = useSettingsStore((s) => s.setLineHeight);
  const setLetterSpacing = useSettingsStore((s) => s.setLetterSpacing);
  const setMeasure = useSettingsStore((s) => s.setMeasure);
  const resetTypography = useSettingsStore((s) => s.resetTypography);

  /** Switching face also applies that face's recommended rhythm. */
  const chooseFamily = (family: FontFamilyId) => {
    setFontFamily(family);
    const recommended = FONT_RECOMMENDED[family];
    setLineHeight(recommended.lineHeight);
    setLetterSpacing(recommended.letterSpacing);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase">
          Typeface
        </p>
        <Segmented<FontFamilyId>
          label="Transcript typeface"
          size="sm"
          value={typography.fontFamily}
          onChange={chooseFamily}
          className="w-full"
          options={FONT_OPTIONS.map((font) => ({
            value: font.id,
            label: font.label,
            title: `${font.description} (${font.package})`,
          }))}
        />
        <p className="mt-1.5 text-[11px] text-ink-faint">
          {FONT_OPTIONS.find((f) => f.id === typography.fontFamily)?.description}
        </p>
      </div>

      <Slider
        label="Font size"
        value={typography.fontSize}
        min={FONT_SIZE_RANGE.min}
        max={FONT_SIZE_RANGE.max}
        step={FONT_SIZE_RANGE.step}
        display={`${Math.round(typography.fontSize * 16)}px`}
        edgeLabels={["Compact", "Poster"]}
        onChange={setFontSize}
      />

      <Slider
        label="Line height"
        value={typography.lineHeight}
        min={LINE_HEIGHT_RANGE.min}
        max={LINE_HEIGHT_RANGE.max}
        step={LINE_HEIGHT_RANGE.step}
        display={`×${typography.lineHeight.toFixed(2)}`}
        edgeLabels={["Tight", "Airy"]}
        onChange={setLineHeight}
      />

      <Slider
        label="Letter spacing"
        value={typography.letterSpacing}
        min={LETTER_SPACING_RANGE.min}
        max={LETTER_SPACING_RANGE.max}
        step={LETTER_SPACING_RANGE.step}
        display={`${typography.letterSpacing.toFixed(3)}em`}
        edgeLabels={["Dense", "Open"]}
        onChange={setLetterSpacing}
      />

      <Slider
        label="Line length"
        value={typography.measure}
        min={MEASURE_RANGE.min}
        max={MEASURE_RANGE.max}
        step={MEASURE_RANGE.step}
        display={`${typography.measure}ch`}
        edgeLabels={["Narrow", "Wide"]}
        onChange={setMeasure}
      />

      {showSample && (
        <div className="panel-solid p-3">
          <p className="reading-type text-ink">
            <span className="relative mr-1 inline-flex h-[0.72em] w-[3px] translate-y-[0.06em] rounded-full bg-accent align-middle shadow-[0_0_18px_var(--glow)]" />
            Every sentence below the player is a live control — click any line to
            seek the video straight to that moment.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <Sparkles className="h-3 w-3 text-accent" />
          Saved automatically on this device
        </span>
        <button
          type="button"
          onClick={resetTypography}
          className="btn h-8 gap-1.5 border border-line px-2 text-[11.5px]"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>
    </div>
  );
}
