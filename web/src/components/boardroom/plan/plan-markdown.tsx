/* A tiny Markdown renderer for the plan: headings, lists, pipe tables, paragraphs, links.
   ASSUMPTION is always shown as a visible label. No HTML is ever injected. */

import { Fragment, type ReactNode } from "react";

const TOKEN = /(https?:\/\/[^\s|)]+|ASSUMPTION)/g;

function inline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (part === "ASSUMPTION") {
      return <span key={i} className="rounded border border-amber-700/40 bg-amber-50 px-1.5 text-[14px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200">ASSUMPTION</span>;
    }
    if (/^https?:\/\//.test(part)) {
      return <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all underline underline-offset-4">{part}</a>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function PlanMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const heading = /^(#{1,4}) (.*)$/.exec(line);
    if (heading) {
      out.push(heading[1].length <= 2
        ? <h3 key={i} className="mt-6 mb-2 text-xl font-bold">{heading[2]}</h3>
        : <h4 key={i} className="mt-4 mb-1 text-lg font-bold">{heading[2]}</h4>);
      i++;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) { if (!/^\|[-| ]+\|$/.test(lines[i])) rows.push(cells(lines[i])); i++; }
      const [head, ...body] = rows;
      out.push(
        <div key={i} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-[16px]">
            <thead><tr>{head.map((c, k) => <th key={k} className="border-b-2 px-2 py-1.5 text-left font-bold">{c}</th>)}</tr></thead>
            <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="border-b px-2 py-1.5 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (/^\s*- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*- /.test(lines[i])) { items.push(lines[i].replace(/^\s*- /, "")); i++; }
      out.push(<ul key={i} className="my-2 ml-5 list-disc space-y-1">{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4} |\||\s*- )/.test(lines[i])) { para.push(lines[i]); i++; }
      out.push(<p key={i} className="my-2">{inline(para.join(" "))}</p>);
    }
  }
  return <>{out}</>;
}
