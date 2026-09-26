"use client";

import type { ChatMessage } from "@/lib/types";
import { ClipPlanList } from "@/components/assistant/ClipPlanList";
import { RichText } from "@/components/assistant/RichText";
import { useTranscriptStore } from "@/stores/useTranscriptStore";

export function AssistantMessage({ message }: { message: ChatMessage }) {
  const user = message.role === "user";
  const clips = useTranscriptStore((state) => state.clips);
  return (
    <article
      className={user ? "flex justify-end" : "flex justify-start"}
      data-message-id={message.id}
      data-message-role={message.role}
    >
      <div className={user ? "bubble-user max-w-[88%] px-3 py-2" : "bubble-assistant max-w-[94%] px-3 py-2"}>
        {user ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{message.content}</p>
        ) : (
          <div className={message.status === "streaming" ? "stream-caret" : ""}>
            <RichText content={message.content} />
          </div>
        )}
        {message.error && <p className="mt-2 border-t border-danger/20 pt-1.5 text-[11px] leading-relaxed text-danger">{message.error}</p>}
        {!user && (message.model || message.latencyMs) && (
          <p className="mt-2 border-t border-line pt-1.5 font-mono text-[9px] text-ink-faint">
            {message.model ? `answered by ${message.model}` : "assistant"}
            {message.latencyMs ? ` · ${(message.latencyMs / 1000).toFixed(1)}s` : ""}
          </p>
        )}
        {!user && message.clipPlan && <ClipPlanList plan={message.clipPlan} clips={clips} />}
      </div>
    </article>
  );
}
