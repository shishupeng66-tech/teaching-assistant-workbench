import type { ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import "katex/contrib/mhchem";
import type { Doc } from "./types";
export const mathOptions = {
  throwOnError: true,
  trust: false,
  maxExpand: 500,
  maxSize: 10,
  strict: "warn" as const,
};
export function validateMath(doc: Doc) {
  if (doc.type === "math")
    katex.renderToString(String(doc.attrs?.latex || ""), mathOptions);
  for (const child of doc.content || []) validateMath(child);
}
export function RichView({
  doc,
  assetBase = "/api/library/assets",
}: {
  doc: Doc;
  assetBase?: string;
}) {
  function render(node: Doc, key: number): ReactNode {
    const children = (node.content || []).map((n, i) => render(n, i));
    const attrs = node.attrs || {};
    if (node.type === "text") {
      let value: ReactNode = node.text || "";
      for (const mark of node.marks || []) {
        if (mark.type === "bold") value = <strong>{value}</strong>;
        if (mark.type === "italic") value = <em>{value}</em>;
        if (mark.type === "subscript") value = <sub>{value}</sub>;
        if (mark.type === "superscript") value = <sup>{value}</sup>;
        if (mark.type === "strike") value = <s>{value}</s>;
        if (mark.type === "code") value = <code>{value}</code>;
      }
      return <span key={key}>{value}</span>;
    }
    if (node.type === "math") {
      try {
        return (
          <span
            key={key}
            className="formula"
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(
                String(attrs.latex || ""),
                mathOptions,
              ),
            }}
          />
        );
      } catch {
        return (
          <span key={key} className="text-danger">
            公式有误：{String(attrs.latex || "")}
          </span>
        );
      }
    }
    if (node.type === "asset") {
      if (!/^[a-f0-9]{32}$/.test(String(attrs.assetId)))
        return <span key={key}>无效图片</span>;
      return (
        <img
          key={key}
          src={`${assetBase}/${attrs.assetId}/file`}
          alt={String(attrs.alt || "题目图片")}
          loading="lazy"
        />
      );
    }
    if (node.type === "doc") return <div key={key}>{children}</div>;
    if (node.type === "paragraph")
      return <p key={key}>{children.length ? children : <br />}</p>;
    if (node.type === "heading") return <h3 key={key}>{children}</h3>;
    if (node.type === "bulletList") return <ul key={key}>{children}</ul>;
    if (node.type === "orderedList")
      return (
        <ol key={key} start={Number(attrs.start) || 1}>
          {children}
        </ol>
      );
    if (node.type === "listItem") return <li key={key}>{children}</li>;
    if (node.type === "blockquote")
      return <blockquote key={key}>{children}</blockquote>;
    if (node.type === "table")
      return (
        <div key={key} className="rich-table-wrap">
          <table>
            <tbody>{children}</tbody>
          </table>
        </div>
      );
    if (node.type === "tableRow") return <tr key={key}>{children}</tr>;
    if (node.type === "tableCell")
      return (
        <td
          key={key}
          colSpan={Number(attrs.colspan) || 1}
          rowSpan={Number(attrs.rowspan) || 1}
        >
          {children}
        </td>
      );
    if (node.type === "tableHeader")
      return (
        <th
          key={key}
          colSpan={Number(attrs.colspan) || 1}
          rowSpan={Number(attrs.rowspan) || 1}
        >
          {children}
        </th>
      );
    if (node.type === "hardBreak") return <br key={key} />;
    if (node.type === "horizontalRule") return <hr key={key} />;
    return null;
  }
  return <div className="rich-view">{render(doc, 0)}</div>;
}
