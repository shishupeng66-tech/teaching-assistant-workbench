import { useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TableKit } from "@tiptap/extension-table";
import katex from "katex";
import { upload } from "../../api";
import { Button } from "../../components/ui/button";
import { Feedback } from "../../components/Drawer";
import type { Doc } from "./types";
import { RichView, mathOptions } from "./RichView";

const MathNode = Node.create({
  name: "math",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { latex: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-math]",
        getAttrs: (node) => ({
          latex: (node as HTMLElement).getAttribute("data-latex") || "",
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "span",
      { "data-math": "1", "data-latex": node.attrs.latex, class: "math-token" },
      node.attrs.latex,
    ];
  },
});
const AssetNode = Node.create({
  addOptions() {
    return { assetBase: "/api/library/assets" };
  },
  name: "asset",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return { assetId: { default: "" }, alt: { default: "题目图片" } };
  },
  parseHTML() {
    return [
      {
        tag: "img[data-asset-id]",
        getAttrs: (node) => ({
          assetId: (node as HTMLElement).getAttribute("data-asset-id"),
          alt: (node as HTMLElement).getAttribute("alt") || "题目图片",
        }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        "data-asset-id": node.attrs.assetId,
        src: `${this.options.assetBase}/${node.attrs.assetId}/file`,
        alt: node.attrs.alt,
      }),
    ];
  },
});
export default function RichEditor({
  label,
  value,
  onChange,
  assetBase = "/api/library/assets",
}: {
  label: string;
  value: Doc;
  onChange: (value: Doc) => void;
  assetBase?: string;
}) {
  const [current, setCurrent] = useState(value),
    [latex, setLatex] = useState(""),
    [mathOpen, setMathOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
      }),
      Subscript,
      Superscript,
      TableKit,
      MathNode,
      AssetNode.configure({ assetBase }),
    ],
    content: value,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
      },
      handlePaste: (_view, event) => {
        if (event.clipboardData?.files.length) {
          setError("请用“上传图片”将图片保存到本地业务目录");
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON();
      setCurrent(doc);
      onChange(doc);
    },
  });
  async function sendImage(image: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", image);
      const saved = await upload<{ id: string }>(
        assetBase.replace(/^\/api/, ""),
        body,
      );
      editor
        ?.chain()
        .focus()
        .insertContent({
          type: "asset",
          attrs: { assetId: saved.id, alt: image.name },
        })
        .run();
    } catch (e) {
      setError(e instanceof Error ? e.message : "图片上传失败");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  function insertMath() {
    try {
      katex.renderToString(latex, mathOptions);
      editor
        ?.chain()
        .focus()
        .insertContent({ type: "math", attrs: { latex } })
        .run();
      setMathOpen(false);
      setError("");
    } catch (e) {
      setError("公式格式无效：" + (e instanceof Error ? e.message : ""));
    }
  }
  return (
    <section className="rich-editor">
      <div className="rich-label">{label}</div>
      <Feedback error={error} />
      <div className="rich-toolbar">
        {[
          ["加粗", () => editor?.chain().focus().toggleBold().run()],
          ["斜体", () => editor?.chain().focus().toggleItalic().run()],
          ["下标", () => editor?.chain().focus().toggleSubscript().run()],
          ["上标", () => editor?.chain().focus().toggleSuperscript().run()],
          ["列表", () => editor?.chain().focus().toggleBulletList().run()],
          [
            "插入表格",
            () =>
              editor
                ?.chain()
                .focus()
                .insertTable({ rows: 2, cols: 3, withHeaderRow: true })
                .run(),
          ],
          ["增加行", () => editor?.chain().focus().addRowAfter().run()],
          ["增加列", () => editor?.chain().focus().addColumnAfter().run()],
          ["删除表格", () => editor?.chain().focus().deleteTable().run()],
          ["撤销", () => editor?.chain().focus().undo().run()],
        ].map(([text, fn]) => (
          <button
            type="button"
            key={String(text)}
            disabled={!editor || busy}
            onClick={fn as () => void}
          >
            {text as string}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const selection = editor?.state.selection;
            const selected = selection?.$from.nodeAfter;
            if (selected?.type.name === "math") setLatex(selected.attrs.latex);
            setMathOpen(!mathOpen);
          }}
        >
          公式 / 化学式
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          {busy ? "上传中…" : "上传图片"}
        </button>
        <input
          ref={file}
          type="file"
          aria-label={`${label}上传图片`}
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const image = e.target.files?.[0];
            if (image) void sendImage(image);
          }}
        />
      </div>
      {mathOpen && (
        <div className="math-input">
          <label>
            LaTeX / mhchem 公式
            <input
              aria-label={`${label}公式代码`}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder={"例如 \\ce{2H2 + O2 -> 2H2O} 或 x^{2}"}
            />
          </label>
          <Button type="button" disabled={!latex.trim()} onClick={insertMath}>
            插入公式
          </Button>
          <p>
            用 \\ce&#123;…&#125;
            表示化学式、反应箭头和电荷。已选中公式时可删除后重新插入。
          </p>
        </div>
      )}
      <EditorContent editor={editor} />
      <details className="rich-preview" open>
        <summary>渲染预览</summary>
        <RichView doc={current} assetBase={assetBase} />
      </details>
    </section>
  );
}
