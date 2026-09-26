"use client";

/**
 * Client-side chat state. The store owns the NDJSON framing because network
 * chunks are allowed to split in the middle of a JSON line; components only
 * render complete events.
 */
import { create } from "zustand";

import type {
  ChatHistoryEntry,
  ChatMessage,
  ChatMode,
  ChatRequest,
  ChatStreamEvent,
} from "@/lib/types";
import { mapClipPlan } from "@/lib/clips/map";
import { useTranscriptStore } from "@/stores/useTranscriptStore";

interface ChatState {
  messages: ChatMessage[];
  mode: ChatMode;
  isStreaming: boolean;
  sendMessage: (message: string, mode?: ChatMode) => Promise<void>;
  /** Short alias used by compact assistant controls. */
  send: (message: string, mode?: ChatMode) => Promise<void>;
  setMode: (mode: ChatMode) => void;
  stop: () => void;
  /** Re-run the last failed request without leaving a duplicate failed turn. */
  retryLast: () => Promise<void>;
  clear: () => void;
}

let activeAbort: AbortController | null = null;
let lastFailedRequest: { message: string; mode: ChatMode } | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  mode: "chat",
  isStreaming: false,

  setMode: (mode) => set({ mode }),

  send: (message, mode) => get().sendMessage(message, mode),

  sendMessage: async (message, requestedMode) => {
    const text = message.trim();
    if (!text || get().isStreaming) return;

    const transcriptState = useTranscriptStore.getState();
    const transcript = transcriptState.transcript;
    if (!transcript) {
      const id = makeId();
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id,
            role: "assistant",
            content: "Load a transcript first — the assistant needs the video text as context.",
            createdAt: Date.now(),
            status: "error",
            error: "No transcript loaded.",
            errorCode: "no-transcript",
            retryable: false,
          },
        ],
      }));
      return;
    }

    const mode = requestedMode ?? get().mode;
    set({ mode });
    lastFailedRequest = { message: text, mode };

    // Capture history before appending this question. Including the new user
    // turn here would send it twice and makes follow-up answers oddly repetitive.
    const priorHistory = historyFromMessages(get().messages);
    const userId = makeId();
    const assistantId = makeId();
    const startedAt = Date.now();
    set((state) => ({
      isStreaming: true,
      messages: [
        ...state.messages,
        {
          id: userId,
          role: "user",
          content: text,
          createdAt: startedAt,
          status: "done",
        },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: startedAt,
          status: "streaming",
        },
      ],
    }));

    const metadata = transcriptState.metadata;
    const payload: ChatRequest = {
      mode,
      message: text,
      transcript: {
        videoId: transcript.videoId,
        title: metadata?.title || (transcript.source === "demo" ? "TranStudio demo" : "Untitled video"),
        durationSeconds: transcript.durationSeconds,
        text: transcript.text,
        segments:
          mode === "clips" || mode === "chapters"
            ? transcript.segments.map((segment) => ({
                i: segment.id,
                t: segment.offset,
                d: segment.duration,
                x: segment.text,
              }))
            : [],
        language: transcript.language,
      },
      history: priorHistory,
    };

    const abort = new AbortController();
    activeAbort = abort;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify(payload),
        signal: abort.signal,
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { message?: unknown } | null;
        const message = typeof detail?.message === "string" ? safeErrorText(detail.message) : "";
        throw new Error(message || `Assistant request failed (${response.status}). Try again.`);
      }
      if (!response.body) throw new Error("The assistant returned an empty stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawDone = false;
      const consume = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let event: ChatStreamEvent;
        try {
          event = JSON.parse(trimmed) as ChatStreamEvent;
        } catch {
          return;
        }
        handleEvent(event, assistantId, transcript);
        if (event.type === "done") sawDone = true;
      };

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          consume(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
      if (!sawDone) finishAssistant(assistantId, false);
      if (useChatStore.getState().messages.find((message) => message.id === assistantId)?.status !== "error") {
        lastFailedRequest = null;
      }
    } catch (error) {
      if (abort.signal.aborted) {
        finishAssistant(assistantId, true);
      } else {
        const message = error instanceof Error ? error.message : "The assistant could not answer.";
        setAssistantError(assistantId, message);
      }
    } finally {
      if (activeAbort === abort) activeAbort = null;
      set({ isStreaming: false });
    }
  },

  stop: () => {
    activeAbort?.abort();
    activeAbort = null;
  },

  retryLast: async () => {
    if (get().isStreaming || !lastFailedRequest) return;
    const request = lastFailedRequest;
    const messages = get().messages;
    const assistantIndex = [...messages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(({ message }) => message.role === "assistant" && message.status === "error")?.index;
    const userIndex =
      assistantIndex === undefined
        ? undefined
        : [...messages]
            .map((message, index) => ({ message, index }))
            .reverse()
            .find(({ message, index }) => index < assistantIndex && message.role === "user")?.index;

    // Replace the failed turn in-place. Keeping the old error and appending a
    // second user question makes a temporary provider outage look like a
    // duplicated conversation.
    if (assistantIndex !== undefined && userIndex !== undefined) {
      set({
        messages: messages.filter((_, index) => index !== assistantIndex && index !== userIndex),
      });
    }
    await get().sendMessage(request.message, request.mode);
  },

  clear: () => {
    activeAbort?.abort();
    activeAbort = null;
    lastFailedRequest = null;
    useTranscriptStore.getState().clearClips();
    set({ messages: [], isStreaming: false });
  },
}));

function handleEvent(
  event: ChatStreamEvent,
  assistantId: string,
  transcript: NonNullable<ReturnType<typeof useTranscriptStore.getState>["transcript"]>,
): void {
  switch (event.type) {
    case "delta":
      updateAssistant(assistantId, (message) => ({
        ...message,
        content: message.content + event.text,
        status: "streaming",
      }));
      return;
    case "meta":
      updateAssistant(assistantId, (message) => ({ ...message, model: event.model }));
      return;
    case "clips": {
      const clips = mapClipPlan(event.plan, transcript);
      useTranscriptStore.getState().setClips(clips);
      updateAssistant(assistantId, (message) => ({ ...message, clipPlan: event.plan }));
      return;
    }
    case "error":
      setAssistantError(assistantId, event.message, event.code);
      return;
    case "done":
      finishAssistant(assistantId, true);
      return;
  }
}

function updateAssistant(
  id: string,
  update: (message: ChatMessage) => ChatMessage,
): void {
  useChatStore.setState((state) => ({
    messages: state.messages.map((message) => (message.id === id ? update(message) : message)),
  }));
}

function finishAssistant(id: string, successful: boolean): void {
  updateAssistant(id, (message) => ({
    ...message,
    status: message.status === "error" ? "error" : successful ? "done" : "done",
    latencyMs: message.latencyMs ?? Date.now() - message.createdAt,
  }));
}

function setAssistantError(id: string, error: string, code?: string): void {
  const safe = safeErrorText(error);
  const nonRetryable = new Set(["missing-key", "invalid-key", "blocked", "no-transcript"]);
  updateAssistant(id, (message) => ({
    ...message,
    status: "error",
    error: safe,
    errorCode: code,
    retryable: !code || !nonRetryable.has(code),
    // Do not put the provider's error into the message body. The body is
    // rendered as normal assistant prose; the dedicated error row below it is
    // the only place a recoverable failure belongs.
    content: message.content || "The assistant couldn't complete that request.",
    latencyMs: Date.now() - message.createdAt,
  }));
}

function safeErrorText(value: string): string {
  const text = value.trim();
  if (!text || text.length > 500) return "The assistant could not complete that request. Try again in a moment.";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      return "The assistant could not complete that request. Try again in a moment.";
    }
  } catch {
    // Plain, server-authored messages are safe to show.
  }
  return text;
}

function historyFromMessages(messages: ChatMessage[]): ChatHistoryEntry[] {
  return messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim())
    .slice(-8)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content.slice(0, 6_000),
    }));
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
