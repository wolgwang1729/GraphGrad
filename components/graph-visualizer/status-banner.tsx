import type { ReactNode } from "react";

import { InlineMath } from "react-katex";

import { useGraphEditor } from "./context";
import type { StatusState, StatusTone } from "./types";

function renderTextWithMath(text: string): ReactNode {
  if (!text.includes("$")) return text;

  const segments: ReactNode[] = [];
  const regex = /\$\$([^$]+?)\$\$|\$([^$]+?)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }

    const mathContent = match[1] ?? match[2];
    const isDisplay = match[1] !== undefined;

    segments.push(
      <span
        key={key++}
        style={
          isDisplay
            ? {
                display: "block",
                textAlign: "center",
                overflowX: "auto",
                overflowY: "hidden",
                maxWidth: "100%",
                verticalAlign: "middle",
              }
            : { display: "inline-block", verticalAlign: "middle" }
        }
      >
        <InlineMath math={mathContent} />
      </span>,
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return segments;
}

export function ToneBanner({ status }: { status: StatusState }) {
  const { isDarkMode } = useGraphEditor();
  const toneClasses: Record<StatusTone, string> = {
    info: `border-sky-500/30 bg-sky-500/10 ${isDarkMode ? "text-slate-300" : "text-sky-900"}`,
    success: `border-emerald-500/30 bg-emerald-500/10 ${isDarkMode ? "text-slate-300" : "text-emerald-900"}`,
    error: `border-rose-500/30 bg-rose-500/10 ${isDarkMode ? "text-slate-300" : "text-rose-900"}`,
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${toneClasses[status.tone]}`}>
      {renderTextWithMath(status.text)}
    </div>
  );
}
