import { test, expect } from "../frontend/node_modules/@playwright/test/index";
const headers = { "X-Workbench-Request": "1" };

test("独立化学空间：五入口、导入隔离、二维全局局部、拖拽缩放、状态保存及旧路由", async ({
  page,
  request,
}) => {
  const mainBefore = await (
    await request.get("/api/library/statistics")
  ).json();
  const catalogBefore = await (
    await request.get("/api/library/catalog")
  ).json();
  await page.goto("/chemistry-graph/data");
  await page
    .getByRole("button", { name: "导入固定版本初中化学资源", exact: true })
    .click();
  await expect(
    page.getByText("知识点45 · 诊断题180 · 关系80 · 题图48", { exact: true }),
  ).toBeVisible();
  const mainAfter = await (await request.get("/api/library/statistics")).json();
  expect(mainAfter.total).toBe(mainBefore.total);
  expect(
    (await (await request.get("/api/library/catalog")).json()).nodes,
  ).toEqual(catalogBefore.nodes);
  await page.goto("/questions/graph");
  await expect(page).toHaveURL(/\/chemistry-graph$/);
  await expect(page.getByLabel("业务导航").getByRole("link")).toHaveCount(6);
  await expect(page.locator(".react-flow__node")).toHaveCount(45);
  await expect(page.locator(".react-flow__edge")).toHaveCount(80);
  const graph = await (
    await request.get("/api/chemistry-graph/overview")
  ).json();
  const p = graph.points.find(
    (p: { external_id: string }) => p.external_id === "cnk_j017",
  );
  await page.getByLabel("搜索定位知识点").fill("cnk_j017");
  await page.getByLabel("定位图谱节点").selectOption(p.id);
  await expect(page.getByRole("dialog")).toContainText("质量守恒定律");
  await expect(page.getByRole("dialog")).toContainText("cnk_j017");
  await page.getByRole("button", { name: "关闭侧边栏", exact: true }).click();
  await page.getByRole("button", { name: "局部关系", exact: true }).click();
  await expect
    .poll(() => page.locator(".react-flow__node").count())
    .toBeLessThan(45);
  const transform = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect
    .poll(() => page.locator(".react-flow__viewport").getAttribute("style"))
    .not.toBe(transform);
  await page.getByRole("button", { name: "适应画布", exact: true }).click();
  const node = page.locator(`.react-flow__node[data-id="${p.id}"]`);
  await expect(node).toBeVisible();
  const box = await node.boundingBox();
  expect(box).toBeTruthy();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 50,
      box.y + box.height / 2 + 35,
      { steps: 8 },
    );
    await page.mouse.up();
  }
  await expect
    .poll(async () => {
      const r = await (await request.get("/api/chemistry-graph/view")).json();
      return Boolean(r.positions?.[p.id]);
    })
    .toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "局部关系", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.locator(".react-flow__node").count())
    .toBeLessThan(45);
  await page.getByRole("button", { name: "全局图谱", exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(45);
  await expect(
    page.locator('.react-flow__edge-path[style*="stroke-dasharray"]'),
  ).not.toHaveCount(0);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  await page
    .getByRole("button", { name: "切换为深色模式", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("独立诊断题编辑审核、图片、分页和独立备份恢复不影响原题库", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/library/statistics")).json();
  await page.goto("/chemistry-graph/questions");
  await expect(
    page.getByRole("heading", { name: "诊断题库（180）", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".cg-question-row")).toHaveCount(20);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByText("第2页", { exact: true })).toBeVisible();
  await page.getByLabel("搜索独立诊断题").fill("cnk_j004_q1");
  await page.locator(".cg-question-row").first().click();
  await expect(page.locator("img").first()).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("img")
        .first()
        .evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
    )
    .toBeTruthy();
  const identity = page.url().split("/").at(-1)!;
  await page.getByRole("button", { name: "编辑题目", exact: true }).click();
  const answer = page.getByRole("textbox", { name: "独立答案", exact: true });
  await answer.click();
  await answer.press("ControlOrMeta+A");
  await answer.type("教师修订参考答案");
  await page.getByRole("button", { name: "保存独立题目", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "参考答案", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("教师修订参考答案", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "审核通过", exact: true }).click();
  await expect(
    page.getByText("已审核 · 难度1 · 版本3", { exact: true }),
  ).toBeVisible();
  const metadata = await (
    await request.get("/api/chemistry-graph/questions/" + identity)
  ).json();
  expect(metadata.grading_manual).toBeTruthy();
  expect(metadata.history).toHaveLength(3);
  const snapshot = await (
    await request.post("/api/chemistry-graph/backups", { headers, data: {} })
  ).json();
  await request.post("/api/chemistry-graph/view", {
    headers,
    data: { positions: {}, mode: "global", selected: "" },
  });
  const restore = await request.post("/api/chemistry-graph/backups/restore", {
    headers,
    data: { name: snapshot.name, confirmation: "恢复独立化学知识图谱" },
  });
  expect(restore.ok()).toBeTruthy();
  expect(
    (await (await request.get("/api/library/statistics")).json()).total,
  ).toBe(before.total);
  await page.goto("/settings");
  await expect(
    page.getByRole("link", { name: "管理独立图谱备份与恢复", exact: true }),
  ).toBeVisible();
});

test("教师主动诊断练习、反馈、完成记录和刷新恢复仅属于独立空间", async ({
  page,
  request,
}) => {
  await page.goto("/chemistry-graph/practice");
  await expect(
    page.getByRole("button", { name: "开始诊断练习", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("诊断最多题数").selectOption("2");
  await page
    .getByLabel("我了解来源题目及自动判分存在局限，仅作教师试做", {
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "开始诊断练习", exact: true }).click();
  for (let step = 0; step < 2; step++) {
    const options = page.locator(".cg-choices input");
    await expect(options.first()).toBeVisible();
    await options.first().check();
    await page
      .getByRole("button", { name: "提交本题并继续", exact: true })
      .click();
    await expect(page.getByLabel("上题反馈")).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: "本次练习结束", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "本次练习结束", exact: true }),
  ).toBeVisible();
  const sessions = await (
    await request.get("/api/chemistry-graph/practice")
  ).json();
  expect(sessions.items[0].answer_count).toBe(2);
});
