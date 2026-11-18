import hashlib
import json
import re
import unicodedata
from uuid import UUID

NODE_CHILDREN = {
    "doc",
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "table",
    "tableRow",
    "tableCell",
    "tableHeader",
}
MARKS = {"bold", "italic", "strike", "subscript", "superscript", "code"}


def document(text=""):
    # Excel plain text supports $LaTeX$ / $\ce{...}$ without executing HTML.
    paragraphs = []
    for line in text.splitlines() or [""]:
        children = []
        for index, part in enumerate(re.split(r"\$([^$]+)\$", line)):
            if part:
                children.append(
                    {"type": "math", "attrs": {"latex": part}}
                    if index % 2
                    else {"type": "text", "text": part}
                )
        paragraphs.append({"type": "paragraph", "content": children})
    return {"type": "doc", "content": paragraphs}


def validate_document(value):
    if not isinstance(value, dict) or value.get("type") != "doc":
        raise ValueError("内容必须为结构化文档")
    if len(json.dumps(value, ensure_ascii=False)) > 120000:
        raise ValueError("单项富文本内容过大")
    count = 0

    def visit(node, depth=0):
        nonlocal count
        count += 1
        if depth > 16 or count > 2000 or not isinstance(node, dict):
            raise ValueError("文档层级或节点过多")
        if set(node) - {"type", "content", "attrs", "text", "marks"}:
            raise ValueError("富文本含不支持字段")
        kind = node.get("type")
        result = {"type": kind}
        if not isinstance(node.get("attrs", {}), dict):
            raise ValueError("内容属性须为对象")
        if kind == "text":
            text = node.get("text")
            if not isinstance(text, str) or len(text) > 20000:
                raise ValueError("文字格式不合法")
            result["text"] = text
            marks = node.get("marks", [])
            if not isinstance(marks, list) or any(
                not isinstance(m, dict) or set(m) != {"type"} or m["type"] not in MARKS
                for m in marks
            ):
                raise ValueError("不支持的文字标记")
            if marks:
                result["marks"] = marks
            if node.get("attrs") or node.get("content"):
                raise ValueError("文字节点格式不合法")
        elif kind == "math":
            attrs = node.get("attrs", {})
            latex = attrs.get("latex")
            if (
                set(attrs) != {"latex"}
                or not isinstance(latex, str)
                or not latex.strip()
                or len(latex) > 2000
            ):
                raise ValueError("公式须为1–2000字符的LaTeX")
            if re.search(
                r"\\(?:href|url|includegraphics|html\w*|def|gdef|newcommand|renewcommand|input|include|write|require|usepackage)\b",
                latex,
                re.I,
            ):
                raise ValueError("公式包含不允许的外部或宏命令")
            balance = 0
            for match in re.finditer(r"(?<!\\)[{}]", latex):
                balance += 1 if match.group() == "{" else -1
                if balance < 0:
                    raise ValueError("公式花括号不匹配")
            if balance:
                raise ValueError("公式花括号不匹配")
            result["attrs"] = {"latex": latex}
        elif kind == "asset":
            attrs = node.get("attrs", {})
            if set(attrs) - {"assetId", "alt"} or not re.fullmatch(
                "[a-f0-9]{32}", attrs.get("assetId", "")
            ):
                raise ValueError("图片必须使用本地附件 ID")
            alt = attrs.get("alt", "")
            if not isinstance(alt, str) or len(alt) > 200:
                raise ValueError("图片说明过长")
            result["attrs"] = {"assetId": attrs["assetId"], "alt": alt}
        elif kind in NODE_CHILDREN:
            if not isinstance(node.get("content", []), list):
                raise ValueError("内容格式不合法")
            result["content"] = [
                visit(child, depth + 1) for child in node.get("content", [])
            ]
            attrs = node.get("attrs", {})
            allowed = {
                "heading": {"level"},
                "orderedList": {"start"},
                "tableCell": {"colspan", "rowspan", "colwidth", "align"},
                "tableHeader": {"colspan", "rowspan", "colwidth", "align"},
            }.get(kind, set())
            if not isinstance(attrs, dict) or set(attrs) - allowed:
                raise ValueError("不支持的内容属性")
            if kind == "heading":
                if not isinstance(attrs.get("level", 2), int):
                    raise ValueError("标题级别无效")
                result["attrs"] = {"level": min(3, max(1, attrs.get("level", 2)))}
            if kind == "orderedList":
                if not isinstance(attrs.get("start", 1), int):
                    raise ValueError("列表起始值无效")
                result["attrs"] = {"start": min(100, max(1, attrs.get("start", 1)))}
            if kind in ("tableCell", "tableHeader"):
                for key in ("colspan", "rowspan"):
                    val = attrs.get(key, 1)
                    if not isinstance(val, int) or not 1 <= val <= 20:
                        raise ValueError("表格跨度无效")
                result["attrs"] = {k: attrs.get(k, 1) for k in ("colspan", "rowspan")}
                if attrs.get("align") not in (None, "left", "center", "right"):
                    raise ValueError("表格对齐无效")
                if attrs.get("align"):
                    result["attrs"]["align"] = attrs["align"]
                widths = attrs.get("colwidth")
                if widths is not None and (
                    not isinstance(widths, list)
                    or len(widths) > 20
                    or any(not isinstance(w, int) or not 1 <= w <= 2000 for w in widths)
                ):
                    raise ValueError("表格列宽无效")
        elif kind in ("hardBreak", "horizontalRule"):
            if node.get("attrs") or node.get("content") or node.get("text"):
                raise ValueError("分隔节点格式无效")
        else:
            raise ValueError("不支持的富文本节点（禁止HTML和外部图片）")
        if kind not in ("text",) and node.get("marks"):
            raise ValueError("该节点不支持文字标记")
        return result

    result = visit(value)

    # Validate block/inline shapes, not arbitrary nested HTML-like structures.
    def shape(node):
        kind = node["type"]
        children = node.get("content", [])
        types = [x["type"] for x in children]
        allowed = {
            "doc": {
                "paragraph",
                "heading",
                "bulletList",
                "orderedList",
                "blockquote",
                "table",
                "horizontalRule",
            },
            "paragraph": {"text", "math", "asset", "hardBreak"},
            "heading": {"text", "math", "hardBreak"},
            "bulletList": {"listItem"},
            "orderedList": {"listItem"},
            "listItem": {"paragraph", "bulletList", "orderedList"},
            "blockquote": {"paragraph", "heading", "bulletList", "orderedList"},
            "table": {"tableRow"},
            "tableRow": {"tableCell", "tableHeader"},
            "tableCell": {"paragraph", "bulletList", "orderedList"},
            "tableHeader": {"paragraph", "bulletList", "orderedList"},
        }
        if kind in allowed and any(t not in allowed[kind] for t in types):
            raise ValueError("富文本结构不合法")
        for child in children:
            shape(child)

    shape(result)
    return result


def text_of(doc):
    if doc.get("type") == "text":
        return doc.get("text", "")
    if doc.get("type") == "math":
        return doc["attrs"]["latex"]
    if doc.get("type") == "asset":
        return "[图片:" + doc["attrs"]["assetId"] + "]"
    separator = "\n" if doc.get("type") in ("doc", "table", "tableRow") else ""
    return separator.join(text_of(x) for x in doc.get("content", []))


def asset_ids(doc):
    ids = set()
    if doc.get("type") == "asset":
        ids.add(doc["attrs"]["assetId"])
    for child in doc.get("content", []):
        ids.update(asset_ids(child))
    return ids


def normalize(doc):
    raw = unicodedata.normalize("NFKC", text_of(doc)).casefold()
    return re.sub(r"[\W_]+", "", raw)


def fingerprint(doc):
    return hashlib.sha256(normalize(doc).encode()).hexdigest()
