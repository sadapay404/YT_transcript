"use client";

import { AlertCircle, RotateCw } from "lucide-react";

import type { ChatMessage } from "@/lib/types";
import { GeminiLogo, GroqLogo, NexAIMark } from "@/components/assistant/AiLogos";
import { ClipPlanList } from "@/components/assistant/ClipPlanList";
import { ClipScanning } from "@/components/assistant/ClipScanning";
import { RichText } from "@/components/assistant/RichText";
import { useTranscriptStore } from "@/stores/useTranscriptStore";

export function AssistantMessage({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry?: () => void;
}) {
  const clips = useTranscriptStore((state) => state.clips);
  const lines = useTranscriptStore((state) => state.transcript?.segments.length ?? 0);

  if (message.role === "user") {
    return (
      <article className="flex justify-end" data-message-id={message.id} data-message-role="user">
        <div className="bubble-user nexai-user max-w-[86%] rounded-2xl rounded-br-md px-3 py-2">
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{message.content}</p>
        </div>
      </article>
    );
  }

  const streaming = message.status === "streaming";
  const waiting = streaming && !message.content && !message.clipPlan;
  const clipTurn = message.mode === "clips";

  return (
    <article className="flex items-start gap-2" data-message-id={message.id} data-message-role="assistant">
      <span className="nexai-avatar mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <NexAIMark className="h-4 w-4" animated={streaming} />
      </span>
      <div className="min-w-0 flex-1">
        {waiting ? (
          clipTurn ? (
            <ClipScanning lines={lines} />
          ) : (
            <div className="nexai-thinking inline-flex items-center gap-1.5 rounded-2xl rounded-tl-md px-3 py-2.5" aria-label="NexAI is thinking">
              <span className="nexai-dot" />
              <span className="nexai-dot" />
              <span className="nexai-dot" />
            </div>
          )
        ) : message.status === "error" ? (
          <div role="alert" className="rounded-2xl rounded-tl-md border border-danger/25 bg-danger/[0.06] px-3 py-2.5">
            <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
              <span>{message.error ?? message.content}</span>
            </p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="btn mt-2 h-7 gap-1.5 rounded-full border border-danger/30 px-2.5 text-[10.5px] text-danger hover:border-danger hover:bg-danger/10"
              >
                <RotateCw className="h-3 w-3" /> Retry
              </button>
            )}
          </div>
        ) : (
          <div className={clipTurn && message.clipPlan ? "" : "bubble-assistant rounded-2xl rounded-tl-md px-3 py-2"}>
            {message.clipPlan ? (
              <ClipPlanList plan={message.clipPlan} clips={clips} />
            ) : (
              <div className={streaming ? "stream-caret" : ""}>
                <RichText content={message.content} />
              </div>
            )}
          </div>
        )}

        {!waiting && message.status !== "error" && (message.provider || message.latencyMs) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 text-[10px] text-ink-faint">
            {message.provider === "gemini" && <GeminiLogo className="h-3 w-3" />}
            {message.provider === "groq" && <GroqLogo className="h-3 w-3" />}
            <span>
              {message.provider === "groq" ? "Groq" : message.provider === "gemini" ? "Gemini" : "NexAI"}
              {message.latencyMs && !streaming ? ` · ${(message.latencyMs / 1000).toFixed(1)}s` : ""}
            </span>
            {message.note && <span className="basis-full text-ink-faint/90">{message.note}</span>}
          </p>
        )}
      </div>
    </article>
  );
}
