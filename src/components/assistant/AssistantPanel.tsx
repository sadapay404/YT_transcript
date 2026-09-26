"use client";

import { FormEvent, useState } from "react";
import { Bot, ChevronDown, RotateCcw, Scissors, Send, Sparkles, X } from "lucide-react";

import { SUGGESTED_PROMPTS } from "@/lib/constants";
import type { ChatMode } from "@/lib/types";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { AssistantMessage } from "@/components/assistant/AssistantMessage";
import { useChatStore } from "@/stores/useChatStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTranscriptStore } from "@/stores/useTranscriptStore";
import { cn } from "@/lib/utils";

export function AssistantPanel() {
  const open = useSettingsStore((state) => state.sidebarOpen);
  const toggle = useSettingsStore((state) => state.toggleSidebar);
  const transcript = useTranscriptStore((state) => state.transcript);
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const clear = useChatStore((state) => state.clear);
  const { width, isResizing, separatorProps } = useResizablePanel();
  const [draft, setDraft] = useState("");

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isStreaming) return;
    setDraft("");
    void sendMessage(text);
  };

  const ask = (text: string, mode: ChatMode = "chat") => {
    if (isStreaming) return;
    void sendMessage(text, mode);
  };

  return (
    <aside
      className={cn("panel relative flex min-h-0 w-full shrink-0 flex-col overflow-hidden lg:w-[var(--assistant-width)]", isResizing && "select-none")}
      style={{ "--assistant-width": `${width}px` } as React.CSSProperties}
      aria-label="TranStudio assistant"
      data-assistant-panel
    >
      <div
        {...separatorProps}
        className="absolute inset-y-0 left-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize items-center justify-center lg:flex"
      >
        <span className="h-12 w-1 rounded-full bg-line-strong transition-colors hover:bg-accent" />
      </div>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5 lg:pl-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent"><Bot className="h-3.5 w-3.5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-ink">Assistant</h2>
          <p className="truncate text-[10px] text-ink-faint">Grounded in this transcript</p>
        </div>
        {messages.length > 0 && <button type="button" onClick={clear} title="Clear conversation" className="btn btn-icon h-8 w-8 border border-line"><RotateCcw className="h-3.5 w-3.5" /></button>}
        <button type="button" onClick={toggle} title="Close assistant" aria-label="Close assistant" className="btn btn-icon h-8 w-8 border border-line"><X className="h-3.5 w-3.5" /></button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 lg:px-4">
        {!transcript ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center text-center">
            <Sparkles className="h-6 w-6 text-accent" />
            <p className="mt-2 text-[13px] font-medium text-ink">Load a transcript to begin</p>
            <p className="mt-1 max-w-xs text-[11.5px] leading-relaxed text-ink-faint">The assistant never guesses beyond the words in the reading rail.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex min-h-full flex-col justify-end">
            <div className="mb-4 rounded-xl border border-line bg-ink/[0.035] p-3">
              <div className="flex items-center gap-2 text-accent"><Sparkles className="h-3.5 w-3.5" /><span className="text-[11px] font-semibold uppercase tracking-[0.12em]">Ask the transcript</span></div>
              <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">Summaries, claims, explanations and clip ideas — all based on the loaded words.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {SUGGESTED_PROMPTS.slice(0, 3).map((prompt) => <button key={prompt} type="button" onClick={() => ask(prompt)} className="rounded-lg border border-line px-2.5 py-2 text-left text-[11px] text-ink-soft transition-colors hover:border-accent/50 hover:text-ink">{prompt}</button>)}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => <AssistantMessage key={message.id} message={message} />)}
          </div>
        )}
      </div>

      {transcript && (
        <div className="border-t border-line px-3 py-2 lg:px-4">
          <div className="mb-2 flex gap-1.5 overflow-x-auto">
            <button type="button" disabled={isStreaming} onClick={() => ask("Find the most viral moments and return a strict JSON clip plan.", "clips")} className="btn h-7 shrink-0 gap-1.5 border border-accent/40 bg-accent-soft px-2 text-[10.5px] text-accent disabled:opacity-50"><Scissors className="h-3 w-3" /> Find viral clips</button>
            <button type="button" disabled={isStreaming} onClick={() => ask("Summarize this video in five faithful bullets.", "summary")} className="btn h-7 shrink-0 gap-1.5 border border-line px-2 text-[10.5px] disabled:opacity-50"><ChevronDown className="h-3 w-3" /> Summarize</button>
          </div>
          <form onSubmit={submit} className="flex items-end gap-2 rounded-xl border border-line bg-ink/[0.035] p-1.5 focus-within:border-accent/50">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={isStreaming} rows={1} maxLength={4000} placeholder="Ask about the video…" aria-label="Ask the assistant" className="max-h-28 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-[12px] text-ink outline-none placeholder:text-ink-faint" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <button type="submit" disabled={!draft.trim() || isStreaming} aria-label="Send question" title="Send question" className="btn btn-primary btn-icon h-8 w-8 shrink-0 disabled:opacity-40"><Send className="h-3.5 w-3.5" /></button>
          </form>
          <p className="mt-1.5 text-center text-[9.5px] text-ink-faint">Free-tier Gemini · no sign-up · transcript only</p>
        </div>
      )}
    </aside>
  );
}
