"use client";

import { Fragment } from "react";

/** Small, dependency-free Markdown renderer for model text. */
export function RichText({ content, className = "" }: { content: string; className?: string }) {
  if (!content.trim()) {
    return <span className="inline-flex items-center gap-1 text-ink-faint" aria-label="Thinking"><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]" /><i className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" /></span>;
  }

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="my-1.5 list-disc space-y-1 pl-5">
        {list.map((item, index) => <li key={`${item}-${index}`}>{renderInline(item)}</li>)}
      </ul>,
    );
    list = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flushList();
    if (!trimmed) {
      blocks.push(<span key={`space-${index}`} className="block h-2" />);
      return;
    }
    const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      blocks.push(<strong key={`heading-${index}`} className="mt-2 block font-semibold text-ink">{renderInline(heading[1])}</strong>);
      return;
    }
    blocks.push(<p key={`line-${index}`} className="leading-relaxed">{renderInline(trimmed)}</p>);
  });
  flushList();

  return <div className={`text-[13px] text-ink-soft ${className}`}>{blocks.map((block, index) => <Fragment key={index}>{block}</Fragment>)}</div>;
}

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/\S+)/g);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={index} className="font-semibold text-ink">{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={index} className="rounded bg-ink/[0.08] px-1 py-0.5 font-mono text-[11px] text-ink">{token.slice(1, -1)}</code>;
    }
    if (/^https?:\/\//.test(token)) {
      return <a key={index} href={token} target="_blank" rel="noreferrer" className="text-accent underline decoration-accent/40 underline-offset-2">{token}</a>;
    }
    return <Fragment key={index}>{token}</Fragment>;
  });
}
