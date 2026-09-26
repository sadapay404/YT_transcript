"use client";

import { Loader2, RefreshCw } from "lucide-react";

import { NexAIMark } from "@/components/assistant/AiLogos";
import { useChatStore } from "@/stores/useChatStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranscriptStore } from "@/stores/useTranscriptStore";

/**
 * The one-click entry to NexAI's main job, pinned under the transcript: opens
 * the panel and immediately asks for viral clips. Once clips exist it opens
 * them instead, with a small "find again".
 */
export function ViralClipsBar() {
  const clips = useTranscriptStore((state) => state.clips);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const lastMode = useChatStore((state) => state.messages.at(-1)?.mode);
  const findViralClips = useChatStore((state) => state.findViralClips);
  const setSidebarOpen = useSettingsStore((state) => state.setSidebarOpen);
  const finding = isStreaming && lastMode === "clips";
  const hasClips = clips.length > 0;

  return (
    <div className="viral-cta-bar relative z-10 flex shrink-0 items-center gap-2 border-t border-line px-3 py-2" data-viral-clips-bar>
      <button
        type="button"
        onClick={() => (hasClips || finding ? setSidebarOpen(true) : findViralClips())}
        className="viral-cta inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[12.5px] font-semibold"
        data-viral-clips-cta
      >
        {finding ? <Loader2 className="h-4 w-4 animate-spin" /> : <NexAIMark className="h-4 w-4" />}
        {finding
          ? "NexAI is finding viral clips…"
          : hasClips
            ? `View ${clips.length} viral clips`
            : "Use AI To Find Viral Clips"}
      </button>
      {hasClips && !finding && (
        <button
          type="button"
          onClick={findViralClips}
          disabled={isStreaming}
          title="Find viral clips again"
          aria-label="Find viral clips again"
          className="btn btn-icon h-9 w-9 shrink-0 rounded-xl border border-line disabled:opacity-40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
