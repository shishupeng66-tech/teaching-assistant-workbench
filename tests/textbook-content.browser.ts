import { test, expect } from "../frontend/node_modules/@playwright/test";
import fs from "node:fs";
import path from "node:path";
const data = JSON.parse(
  fs.readFileSync(
    path.resolve("../data-seeds/textbook-chemistry-content/content.json"),
    "utf8",
  ),
);
test("六主题课题真实可见、知识点说明、答案解析和刷新", async ({ page }) => {
  const chosen = [...new Set(data.points.map((p: any) => p.theme_id))].map(
    (id) => data.points.find((p: any) => p.theme_id === id),
  );
  for (const p of chosen) {
    await page.goto("/questions?node=" + p.node_ids[0]);
    await expect(
      page.getByRole("heading", { name: p.node, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".question-row")).toHaveCount(6);
    await page
      .getByRole("button", { name: p.name + " · 待教师审核", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(p.definition);
    await expect(page.getByRole("dialog")).toContainText(p.mastery[0]);
    await page.getByRole("button", { name: "关闭侧边栏" }).click();
    await page.locator(".inline-answer summary").first().click();
    await expect(page.locator(".inline-answer").first()).toContainText(
      "参考答案",
    );
    await expect(page.locator(".inline-answer").first()).toContainText("解析");
    await page.reload();
    await expect(page.locator(".question-row")).toHaveCount(6);
  }
  for (const width of [1440, 1280, 900]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
});
test("集中审核预览批准、记录与正式章节关联", async ({ page }) => {
  const p = data.points[0];
  await page.goto("/questions/review?node=" + p.node_ids[0]);
  await expect(
    page.getByText("知识点说明与掌握标准", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "选择当前范围全部待审核内容" })
    .click();
  await page.getByRole("button", { name: "预览批量批准" }).click();
  await expect(page.locator(".review-confirm")).toContainText(
    "知识点 2 · 题目 6",
  );
  await page
    .locator(".review-confirm details")
    .first()
    .locator(":scope > summary")
    .click();
  await expect(page.locator(".review-confirm")).toContainText("候选关联");
  await page.getByRole("button", { name: "确认本批审核", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已处理 8 项");
  await page.goto("/questions?node=" + p.node_ids[0]);
  await page.getByRole("button", { name: "已审核", exact: true }).click();
  await expect(page.locator(".question-row")).toHaveCount(6);
  await page
    .getByRole("button", { name: p.name + " · 已审核", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("approve");
});
