"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Download } from "lucide-react";

import { EXPORT_PRESETS } from "@/lib/constants";
import { buildExport } from "@/lib/export/formats";
import type { ExportFormat } from "@/lib/types";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranscriptStore } from "@/stores/useTranscriptStore";
import { cn } from "@/lib/utils";

export function ExportMenu({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const transcript = useTranscriptStore((state) => state.transcript);
  const clips = useTranscriptStore((state) => state.clips);
  const showTimestamps = useSettingsStore((state) => state.showTimestamps);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("txt");
  const [timestamps, setTimestamps] = useState<boolean | null>(null);
  const [merge, setMerge] = useState(true);
  const [header, setHeader] = useState(true);

  const preset = EXPORT_PRESETS.find((entry) => entry.id === format) ?? EXPORT_PRESETS[0];
  // Derive the visible value from the preference until this popover is changed;
  // syncing it with an effect causes a lint error and a visible toggle flash.
  const withTimestamps = timestamps ?? showTimestamps;
  const exportResult = useMemo(() => {
    if (!transcript) return null;
    return buildExport(transcript, clips, {
      format,
      includeTimestamps: withTimestamps,
      includeHeader: header,
      mergeSentences: merge,
    });
  }, [clips, format, header, merge, transcript, withTimestamps]);

  const close = () => {
    setOpen(false);
    setTimestamps(null);
  };

  const download = () => {
    if (!exportResult) return;
    const blob = new Blob([exportResult.content], { type: exportResult.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportResult.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    close();
  };

  const copyPreview = async () => {
    if (!exportResult) return;
    await navigator.clipboard?.writeText(exportResult.content);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        disabled={!transcript}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        title={transcript ? "Export transcript" : "Load a transcript to export"}
        className={cn("btn gap-2 border border-line disabled:opacity-40", compact ? "btn-icon h-9 w-9" : "h-9 px-2.5")}
      >
        <Download className="h-3.5 w-3.5" />
        {!compact && <span className="text-[12.5px]">Export</span>}
        {!compact && <ChevronDown className="h-3 w-3 text-ink-faint" />}
      </button>

      {open && transcript && exportResult && (
        <div role="menu" aria-label="Export formats" className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-line bg-elevated shadow-panel">
          <div className="border-b border-line px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div><p className="text-[12px] font-semibold text-ink">Ship the transcript</p><p className="text-[10.5px] text-ink-faint">Live preview · {clips.length} clip{clips.length === 1 ? "" : "s"}</p></div>
              <button type="button" onClick={close} className="btn btn-icon h-7 w-7 text-ink-faint" aria-label="Close export menu">×</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {EXPORT_PRESETS.map((entry) => <button key={entry.id} type="button" role="menuitem" onClick={() => setFormat(entry.id)} className={cn("rounded-lg border px-2 py-2 text-left transition-colors", format === entry.id ? "border-accent bg-accent-soft" : "border-line hover:border-line-strong")}><span className="block text-[11px] font-semibold text-ink">{entry.label}</span><span className="mt-0.5 block text-[9.5px] text-ink-faint">{entry.extension}</span></button>)}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 border-y border-line px-3 py-2 text-[10.5px] text-ink-soft">
            {preset.supportsTimestamps && <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={withTimestamps} onChange={(event) => setTimestamps(event.target.checked)} /> timestamps</label>}
            {preset.supportsMerging && <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={merge} onChange={(event) => setMerge(event.target.checked)} /> readable paragraphs</label>}
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={header} onChange={(event) => setHeader(event.target.checked)} /> header</label>
          </div>
          <div className="bg-ink/[0.035] p-3">
            <div className="mb-2 flex items-center justify-between"><span className="font-mono text-[9.5px] text-ink-faint">{exportResult.filename}</span><button type="button" onClick={() => void copyPreview()} className="btn h-7 gap-1.5 border border-line px-2 text-[10px]"><Copy className="h-3 w-3" /> Copy preview</button></div>
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas px-2.5 py-2 font-mono text-[9.5px] leading-relaxed text-ink-soft">{exportResult.content.slice(0, 12_000)}{exportResult.content.length > 12_000 ? "\n… preview truncated" : ""}</pre>
          </div>
          <div className="flex justify-end border-t border-line px-3 py-2.5"><button type="button" onClick={download} className="btn btn-primary h-8 gap-1.5 px-3 text-[11px]"><Check className="h-3.5 w-3.5" /> Download {preset.extension}</button></div>
        </div>
      )}
    </div>
  );
}
