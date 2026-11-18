import { test, expect } from "../frontend/node_modules/@playwright/test/index";
import type {
  APIRequestContext,
  Page,
} from "../frontend/node_modules/@playwright/test/index";
import { execFileSync } from "node:child_process";
let serial = 0;
const headers = { "X-Workbench-Request": "1" };
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
async function post(request: APIRequestContext, path: string, data: object) {
  const response = await request.post("/api/library" + path, { headers, data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return await response.json();
}
async function seed(request: APIRequestContext) {
  const suffix = `${Date.now()}-${++serial}`;
  const subject = await post(request, "/catalog/subjects", {
    name: "化学测试" + suffix,
    code: "CHEM-" + suffix,
  });
  const edition = await post(request, "/catalog/editions", {
    name: "教师自建验证版",
    subject_id: subject.id,
  });
  const book = await post(request, "/catalog/books", {
    edition_id: edition.id,
    grade: "九年级",
    volume: "上册",
  });
  const root = await post(request, "/catalog/nodes", {
    book_id: book.id,
    name: "物质组成章",
    kind: "chapter",
  });
  const child = await post(request, "/catalog/nodes", {
    book_id: book.id,
    parent_id: root.id,
    name: "化学式课时",
    kind: "lesson",
  });
  const e2 = await post(request, "/catalog/editions", {
    name: "另一自建验证版",
    subject_id: subject.id,
  });
  const b2 = await post(request, "/catalog/books", {
    edition_id: e2.id,
    grade: "九年级",
    volume: "下册",
  });
  const n2 = await post(request, "/catalog/nodes", {
    book_id: b2.id,
    name: "跨版本复用章节",
    kind: "chapter",
  });
  const point = await post(request, "/knowledge-points", {
    subject_id: subject.id,
    name: "化学式知识点",
    code: "UI-KP-1",
    node_ids: [root.id, n2.id],
  });
  return { subject, edition, book, root, child, e2, b2, n2, point };
}
async function q(
  request: APIRequestContext,
  subjectId: string,
  stem: string,
  nodeIds: string[],
  extra: object = {},
) {
  return post(request, "/questions", {
    subject_id: subjectId,
    grade: "九年级",
    question_type: "简答题",
    difficulty: 2,
    stem: doc(stem),
    answer: doc("教师核实答案"),
    node_ids: nodeIds,
    confirm_similarity: true,
    ...extra,
  });
}
const scope = (e: Awaited<ReturnType<typeof seed>>) =>
  `/questions?subject=${e.subject.id}&edition=${e.edition.id}&book=${e.book.id}&node=${e.root.id}`;
function excel(rows: unknown[][], kind = "questions") {
  return execFileSync(
    "../backend/.venv/bin/python",
    [
      "-c",
      `import io,sys,json\nfrom openpyxl import Workbook\nfrom app.services.library_import import Q_HEADERS,N_HEADERS\nw=Workbook();s=w.active;s.title='题目导入' if sys.argv[2]=='questions' else '目录导入';s.append(Q_HEADERS if sys.argv[2]=='questions' else N_HEADERS)\nfor r in json.loads(sys.argv[1]):s.append(r)\nb=io.BytesIO();w.save(b);sys.stdout.buffer.write(b.getvalue())`,
      JSON.stringify(rows),
      kind,
    ],
    { cwd: "../backend" },
  );
}
function png() {
  return execFileSync("../backend/.venv/bin/python", [
    "-c",
    "from PIL import Image\nimport io,sys\nb=io.BytesIO();Image.new('RGB',(60,40),'blue').save(b,format='PNG');sys.stdout.buffer.write(b.getvalue())",
  ]);
}

test("教材与知识点的界面新增、目录展开排序及停用", async ({
  page,
  request,
}) => {
  await page.goto("/questions/catalog");
  await page.getByRole("button", { name: "新增学科", exact: true }).click();
  let drawer = page.getByRole("dialog");
  await drawer.getByLabel("学科名称", { exact: true }).fill("界面验证化学");
  await drawer.getByLabel("学科编码", { exact: true }).fill("UI-CATALOG-CHEM");
  await drawer.getByRole("button", { name: "保存学科", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  const sid = await page.getByLabel("管理学科").inputValue();
  await page.getByRole("button", { name: "新增教材版本", exact: true }).click();
  await drawer
    .getByLabel("教材版本名称", { exact: true })
    .fill("教师核实自建版");
  await drawer
    .getByRole("button", { name: "保存教材版本", exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  await page.getByRole("button", { name: "新增册别", exact: true }).click();
  await drawer.getByLabel("年级", { exact: true }).fill("九年级");
  await drawer.getByLabel("学期 / 册别", { exact: true }).fill("上册");
  await drawer
    .getByRole("button", { name: "保存教材册别", exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  await page.getByRole("button", { name: "新增目录节点", exact: true }).click();
  await drawer.getByLabel("目录节点名称", { exact: true }).fill("自建基础章");
  await drawer
    .getByRole("button", { name: "保存目录节点", exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  const all = await (await request.get("/api/library/catalog")).json();
  const root = all.nodes.find((n: { name: string }) => n.name === "自建基础章");
  for (const name of ["课时甲", "课时乙"]) {
    await page
      .getByRole("button", { name: "新增目录节点", exact: true })
      .click();
    await drawer.getByLabel("目录节点名称", { exact: true }).fill(name);
    await drawer.getByLabel("节点层级", { exact: true }).selectOption("lesson");
    await drawer.getByLabel("父级目录", { exact: true }).selectOption(root.id);
    await drawer
      .getByRole("button", { name: "保存目录节点", exact: true })
      .click();
    await expect(drawer).not.toBeVisible();
  }
  await page
    .getByRole("button", { name: "展开自建基础章", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "课时甲", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "上移课时乙", exact: true }).click();
  await expect(page.locator(".tree-name").nth(1)).toHaveText("课时乙");
  await page
    .getByRole("button", { name: "收起自建基础章", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "课时甲", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "自建基础章", exact: true }).click();
  await page.getByRole("button", { name: "编辑当前节点", exact: true }).click();
  await expect(drawer.getByLabel("父级目录", { exact: true })).toHaveValue("");
  await drawer
    .getByLabel("目录节点名称", { exact: true })
    .fill("自建基础章（改名）");
  await drawer
    .getByRole("button", { name: "保存目录节点", exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  await expect(page.locator(".tree-name").first()).toContainText(
    "自建基础章（改名）",
  );
  await page.goto(`/questions/knowledge?subject=${sid}&node=${root.id}&new=1`);
  drawer = page.getByRole("dialog");
  await drawer.getByLabel("知识点名称", { exact: true }).fill("界面验证知识点");
  await drawer.getByLabel("知识点编码", { exact: true }).fill("UI-KNOWLEDGE-1");
  await drawer
    .getByLabel("知识点说明", { exact: true })
    .fill("仅为隔离自动测试建立");
  await drawer.getByRole("button", { name: "保存知识点", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await page.getByLabel("搜索知识点", { exact: true }).fill("UI-KNOWLEDGE-1");
  await expect(page.locator(".knowledge-list")).toContainText("界面验证知识点");
  await page.locator(".knowledge-list").getByRole("button").click();
  await drawer.getByLabel("启用此知识点", { exact: true }).uncheck();
  await drawer.getByRole("button", { name: "保存知识点", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await page.getByLabel("包含停用知识点").check();
  await expect(page.locator(".knowledge-list")).toContainText("停用");
});

test("结构化编辑化学公式、上下标、图片、表格并审核和查看历史", async ({
  page,
  request,
}) => {
  const e = await seed(request);
  await page.goto(`/questions/new?subject=${e.subject.id}&node=${e.root.id}`);
  await page
    .getByRole("textbox", { name: "题干", exact: true })
    .fill("界面化学验证题 SO");
  const stem = page
    .locator(".rich-editor")
    .filter({ has: page.locator(".rich-label").filter({ hasText: /^题干$/ }) });
  await stem.getByRole("button", { name: "下标", exact: true }).click();
  await page
    .getByRole("textbox", { name: "题干", exact: true })
    .pressSequentially("4");
  await stem.getByRole("button", { name: "下标", exact: true }).click();
  await stem.getByRole("button", { name: "上标", exact: true }).click();
  await page
    .getByRole("textbox", { name: "题干", exact: true })
    .pressSequentially("2−");
  await stem.getByRole("button", { name: "上标", exact: true }).click();
  await stem
    .getByRole("button", { name: "公式 / 化学式", exact: true })
    .click();
  await page
    .getByLabel("题干公式代码", { exact: true })
    .fill("\\ce{2H2 + O2 -> 2H2O}");
  await stem.getByRole("button", { name: "插入公式", exact: true }).click();
  await expect(stem.locator(".rich-preview .katex")).toHaveCount(1);
  await page.getByLabel("题干上传图片", { exact: true }).setInputFiles({
    name: "formula-test.png",
    mimeType: "image/png",
    buffer: png(),
  });
  await expect(stem.locator(".rich-preview img")).toBeVisible();
  await stem.getByRole("button", { name: "插入表格", exact: true }).click();
  await expect(stem.locator(".tiptap table")).toBeVisible();
  await page
    .getByRole("textbox", { name: "标准答案", exact: true })
    .fill("由氢元素和氧元素组成");
  await page
    .getByRole("textbox", { name: "解析", exact: true })
    .fill("原子守恒且上下标保留");
  await page.getByRole("checkbox", { name: /UI-KP-1/ }).check();
  await page.getByRole("checkbox", { name: /跨版本复用章节/ }).check();
  await page
    .getByRole("button", { name: "保存草稿", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "题目详情", exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const detail = await (
    await request.get("/api/library/questions/" + id)
  ).json();
  expect(detail.node_ids).toHaveLength(2);
  expect(detail.knowledge_links[0].knowledge_point_id).toBe(e.point.id);
  await page.reload();
  await expect(page.locator(".question-detail-content .katex")).toHaveCount(1);
  await expect(page.locator(".question-detail-content img")).toBeVisible();
  expect(
    await page
      .locator(".question-detail-content img")
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBeTruthy();
  await expect(page.locator(".question-detail-content sub")).toContainText("4");
  await expect(page.locator(".question-detail-content sup")).toContainText(
    "2−",
  );
  await page.getByRole("button", { name: "提交审核", exact: true }).click();
  await expect(page.locator(".question-detail-meta .review-badge")).toHaveText(
    "待审核",
  );
  await page.getByRole("button", { name: "审核通过", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("checkbox").check();
  await drawer
    .getByRole("button", { name: "确认审核通过", exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  await expect(page.locator(".question-detail-meta .review-badge")).toHaveText(
    "已审核",
  );
  const approved = await (
    await request.get("/api/library/questions/" + id)
  ).json();
  await page.getByRole("link", { name: "编辑题目", exact: true }).click();
  await page
    .getByRole("textbox", { name: "题干", exact: true })
    .fill("改写后的独立题目版本，须重新审核");
  await page
    .getByRole("button", { name: "保存草稿", exact: true })
    .first()
    .click();
  await expect(page.locator(".question-detail-meta .review-badge")).toHaveText(
    "草稿",
  );
  await page
    .getByLabel("查看题目历史版本")
    .selectOption(String(approved.version));
  await expect(page.locator(".question-detail-content .katex")).toHaveCount(1);
  await expect(page.locator(".question-detail-content img")).toBeVisible();
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "题目详情", exact: true }),
  ).toBeVisible();
  expect(
    requests.every((url) => new URL(url).hostname === "127.0.0.1"),
  ).toBeTruthy();
});

test("章节下级去重统计、全局搜索、分页与多教材知识点映射", async ({
  page,
  request,
}) => {
  const e = await seed(request);
  await q(
    request,
    e.subject.id,
    "同题跨章节重复引用测试",
    [e.root.id, e.child.id, e.n2.id],
    { knowledge_links: [{ knowledge_point_id: e.point.id }] },
  );
  await q(request, e.subject.id, "实验观察现象特征记录", [e.child.id], {
    question_type: "实验题",
    difficulty: 5,
  });
  await page.goto(scope(e));
  await page.getByLabel("包含全部下级章节").uncheck();
  await expect(page.getByTestId("scope-question-count")).toHaveText("1");
  await page.getByLabel("包含全部下级章节").check();
  await expect(page.getByTestId("scope-question-count")).toHaveText("2");
  await page.getByLabel("题目题型筛选").selectOption("实验题");
  await expect(page.locator(".question-row")).toHaveCount(1);
  await expect(page.locator(".question-row")).toContainText("实验观察");
  await page.getByRole("button", { name: "清空筛选", exact: true }).click();
  for (let i = 0; i < 11; i++)
    await q(request, e.subject.id, `分页模拟${i} 化学计算关系验证`, [
      e.child.id,
    ]);
  await page.reload();
  await page.getByLabel("包含全部下级章节").check();
  await page.getByLabel("每页题目数量").selectOption("10");
  await expect(page.locator(".question-row")).toHaveCount(10);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".question-row")).toHaveCount(3);
  await q(request, e.subject.id, "全局独有的跨教材验证词", [e.n2.id]);
  await page.getByRole("button", { name: "全部题目", exact: true }).click();
  await page.getByLabel("全局题目搜索").fill("全局独有");
  await expect(page.locator(".question-row")).toHaveCount(1);
  await expect(page.locator(".question-row")).toContainText("全局独有");
  await expect(
    page.getByRole("heading", { name: "全部题目", exact: true }),
  ).toBeVisible();
  await page.goto(scope(e));
  await page
    .getByRole("button", { name: "调整知识点关联", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: /化学式知识点/ })
    .uncheck();
  await page
    .getByRole("button", { name: "保存章节知识点关联", exact: true })
    .click();
  const mappings = (await (await request.get("/api/library/catalog")).json())
    .mappings;
  expect(
    mappings.some(
      (m: { node_id: string; knowledge_point_id: string }) =>
        m.node_id === e.n2.id && m.knowledge_point_id === e.point.id,
    ),
  ).toBeTruthy();
  expect(
    mappings.some(
      (m: { node_id: string; knowledge_point_id: string }) =>
        m.node_id === e.root.id && m.knowledge_point_id === e.point.id,
    ),
  ).toBeFalsy();
});

test("相似题须明确确认且不合并，纯文本脚本不执行", async ({
  page,
  request,
}) => {
  const e = await seed(request);
  const original = await q(
    request,
    e.subject.id,
    "水的化学组成与性质，请判断",
    [e.root.id],
  );
  await page.goto(`/questions/new?subject=${e.subject.id}`);
  await page
    .getByRole("textbox", { name: "题干", exact: true })
    .fill("水的化学组成与性质，请判断！");
  await page
    .getByRole("textbox", { name: "标准答案", exact: true })
    .fill("模拟答案");
  await page
    .getByRole("button", { name: "保存草稿", exact: true })
    .first()
    .click();
  await expect(page.locator(".similarity-panel")).toBeVisible();
  await expect(page).toHaveURL(/\/questions\/new/);
  await page.getByLabel("已核对相似题，仍保存为独立题目").check();
  await page
    .getByRole("button", { name: "保存草稿", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "题目详情", exact: true }),
  ).toBeVisible();
  expect(page.url()).not.toContain(original.id);
  const unsafe = await q(
    request,
    e.subject.id,
    "<script>window.__bad=1</script> 只是文本",
    [e.root.id],
  );
  await page.goto("/questions/" + unsafe.id);
  await expect(page.locator(".question-detail-content").first()).toContainText(
    "<script>",
  );
  expect(await page.evaluate(() => "__bad" in window)).toBeFalsy();
});

test("目录和题目Excel均预览确认，错误路径明确阻止导入", async ({
  page,
  request,
}) => {
  const e = await seed(request);
  await page.goto("/questions/catalog");
  await page.getByLabel("管理学科").selectOption(e.subject.id);
  await page.getByLabel("管理教材版本").selectOption(e.edition.id);
  await page.getByLabel("管理册别").selectOption(e.book.id);
  await page.getByRole("button", { name: "批量导入目录", exact: true }).click();
  let drawer = page.getByRole("dialog");
  await drawer.getByLabel("选择导入文件").setInputFiles({
    name: "nodes.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: excel([["新增核实目录", "章", 30, "教师审核说明"]], "nodes"),
  });
  await drawer.getByRole("button", { name: "校验并预览" }).click();
  await expect(
    drawer.getByRole("button", { name: "确认批量保存" }),
  ).toBeDisabled();
  await drawer.getByLabel("输入“目录已审核”").fill("目录已审核");
  await drawer.getByRole("button", { name: "确认批量保存" }).click();
  await expect(drawer.getByRole("status")).toContainText("新增 1 条");
  await drawer.getByRole("button", { name: "关闭侧边栏" }).click();
  await page.goto(scope(e));
  await page.getByRole("button", { name: "批量导入", exact: true }).click();
  drawer = page.getByRole("dialog");
  const row = [
    "判断题",
    "Excel结构化化学验证题",
    "正确",
    "说明",
    2,
    "教师录入",
    e.subject.code,
    e.edition.name,
    "九年级",
    "上册",
    "不存在章节",
    e.point.code,
  ];
  await drawer.getByLabel("选择导入文件").setInputFiles({
    name: "bad.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: excel([row]),
  });
  await drawer.getByRole("button", { name: "校验并预览" }).click();
  await expect(drawer.locator(".import-summary")).toContainText("错误 1 条");
  await expect(
    drawer.getByRole("button", { name: "确认批量保存" }),
  ).toBeDisabled();
  row[10] = e.root.name;
  await drawer.getByLabel("选择导入文件").setInputFiles({
    name: "good.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: excel([row]),
  });
  await drawer.getByRole("button", { name: "校验并预览" }).click();
  await drawer.getByRole("button", { name: "确认批量保存" }).click();
  await expect(drawer.getByRole("status")).toContainText("题目均为草稿");
  await drawer.getByRole("button", { name: "关闭侧边栏" }).click();
  await expect(page.locator(".question-row")).toContainText(
    "Excel结构化化学验证题",
  );
  await expect(page.locator(".question-row .review-badge")).toHaveText("草稿");
});

test("第三阶段新页面在桌面与窄屏、深色下不横向溢出且后续入口禁用", async ({
  page,
  request,
}) => {
  const e = await seed(request);
  const item = await q(request, e.subject.id, "窗口和主题检查的独立验证题", [
    e.root.id,
  ]);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      scope(e),
      "/questions/catalog",
      `/questions/knowledge?subject=${e.subject.id}`,
      `/questions/new?subject=${e.subject.id}`,
      `/questions/${item.id}`,
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} at ${width}`,
      ).toBeTruthy();
    }
  }
  await page.goto(scope(e));
  await page.getByRole("button", { name: "切换为深色模式" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByText("后续教学工具（未开放）", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "按本章组卷（后续）", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "章节测试（后续）", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "AI 教学建议（后续）", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("上海五四教材目录两册：层级顺序、展开收起、切换与课题入口", async ({
  page,
  request,
}) => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const subject = await post(request, "/catalog/subjects", {
    name: "教材导入隔离验证",
    code: "SEED-UI",
  });
  const imported: {
    edition: string;
    book: string;
    nodes: { id: string; name: string; parent_id: string | null }[];
  }[] = [];
  for (const grade of [8, 9]) {
    const data = JSON.parse(
      readFileSync(
        resolve(
          "../data-seeds/textbooks/shanghai-junior-chemistry/grade" +
            grade +
            ".json",
        ),
        "utf8",
      ),
    );
    const ed = await post(request, "/catalog/editions", {
      name: data.edition_name,
      subject_id: subject.id,
    });
    const b = await post(request, "/catalog/books", {
      edition_id: ed.id,
      grade: data.grade,
      volume: data.volume,
    });
    const ids = new Map<string, string>();
    const nodes = [];
    for (const n of data.nodes) {
      const row = await post(request, "/catalog/nodes", {
        book_id: b.id,
        parent_id: n.parent_key ? ids.get(n.parent_key) : null,
        name: n.original_name,
        position: n.position,
        kind:
          n.node_type === "theme" || n.node_type === "appendix"
            ? "chapter"
            : n.node_type === "topic"
              ? "section"
              : "lesson",
      });
      ids.set(n.key, row.id);
      nodes.push(row);
    }
    imported.push({ edition: ed.id, book: b.id, nodes });
  }
  for (const group of imported) {
    await page.goto(
      `/questions?subject=${subject.id}&edition=${group.edition}&book=${group.book}`,
    );
    const tree = page.getByRole("navigation", { name: "教材目录树" });
    for (const n of group.nodes.filter((n) => !n.parent_id)) {
      const button = tree.getByRole("button", {
        name: "展开" + n.name,
        exact: true,
      });
      if (await button.isEnabled()) await button.click();
    }
    for (const n of group.nodes.filter((n) =>
      group.nodes.some((p) => p.id === n.parent_id && !p.parent_id),
    )) {
      const button = tree.getByRole("button", {
        name: "展开" + n.name,
        exact: true,
      });
      if (await button.isEnabled()) await button.click();
    }
    for (const n of group.nodes)
      await expect(
        tree.getByRole("button", { name: n.name, exact: true }).first(),
      ).toBeVisible();
    const names = await tree.locator(".tree-name").allTextContents();
    expect(names).toEqual(group.nodes.map((n) => n.name));
    const lesson = group.nodes[2];
    await tree.getByRole("button", { name: lesson.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp("node=" + lesson.id));
    await expect(
      page.getByRole("link", { name: "新增题目", exact: true }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(new RegExp("node=" + lesson.id));
    const first = group.nodes[0];
    // Expansion state intentionally resets on reload; verify the collapse action explicitly.
    await tree
      .getByRole("button", { name: "展开" + first.name, exact: true })
      .click();
    await tree
      .getByRole("button", { name: "收起" + first.name, exact: true })
      .click();
    await expect(
      tree.getByRole("button", { name: group.nodes[1].name, exact: true }),
    ).toHaveCount(0);
  }
});
