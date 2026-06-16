import type { ReactNode } from "react";

// Render message text with @mentions highlighted — so handoffs read exactly like
// the Band room ("@Bandleader", "@Scout"). The BFF resolves @[[uuid]] tokens to
// @Names; here we wrap those names in a chip. Names can contain spaces, so we
// match against the known mention list rather than a naive \w+ regex.

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function MentionText({ text, mentions }: { text: string; mentions?: string[] }) {
  if (!text) return null;
  const names = mentions && mentions.length ? [...new Set(mentions)] : [];
  if (names.length === 0) return <>{text}</>;

  // longest names first so "@Code Scanner" wins over a shorter prefix
  const pat = new RegExp(`@(${names.sort((a, b) => b.length - a.length).map(escape).join("|")})`, "g");
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pat.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span className="mention" key={i++}>@{m[1]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
