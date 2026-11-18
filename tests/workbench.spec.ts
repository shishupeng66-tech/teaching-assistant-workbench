import { test, expect } from "../frontend/node_modules/@playwright/test/index";

test("六项业务导航、空座位、占位边界及路由刷新", async ({ page, request }) => {
  const created = await request.post("/api/classes", {
    headers: { "X-Workbench-Request": "1" },
    data: { name: "回归测试班级", school_year: "2026-2027" },
  });
  const classId = (await created.json()).id;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?class=" + classId);
  await expect(
    page.getByRole("heading", { name: "教室座位图", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("业务导航").getByRole("link")).toHaveCount(6);
  await expect(page.locator(".seat")).toHaveCount(24);
  await expect(page.locator(".occupied")).toHaveCount(0);
  await expect(
    page.locator(".class-summary").getByRole("button", { name: "新建班级" }),
  ).toBeEnabled();
  await expect(
    page.locator(".page-heading, .notice, .summary-metrics"),
  ).toHaveCount(0);
  for (const [path, name] of [
    ["/questions", "题库"],
    ["/papers", "试卷库"],
    ["/ai", "AI 辅助"],
    ["/settings", "系统设置"],
  ]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.reload();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await page.goto("/missing");
  await expect(page.getByText("没有找到这个页面")).toBeVisible();
  await page.getByRole("link", { name: "返回班级管理" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test("主题持久化、导航折叠和不同窗口宽度无横向溢出", async ({
  page,
  request,
}) => {
  await request.post("/api/classes", {
    headers: { "X-Workbench-Request": "1" },
    data: { name: "宽度回归测试班级", school_year: "2026-2027" },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "切换为深色模式" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "折叠导航" }).click();
  await expect(page.locator(".app")).toHaveClass(/is-collapsed/);
  await page.getByRole("button", { name: "展开导航" }).click();
  for (const width of [1920, 1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/questions", "/papers", "/ai", "/settings"]) {
      await page.goto(path);
      await expect(
        path === "/"
          ? page.getByRole("heading", { name: "教室座位图", exact: true })
          : page.locator("h1"),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${path} at ${width}`,
      ).toBe(true);
    }
  }
});

test("真实备份、恢复确认保护、恢复后副本及状态", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByText("已连接 · SQLite")).toBeVisible();
  const beforeCount = await page.locator(".backup-list li").count();
  await page.getByRole("button", { name: "创建备份" }).click();
  await expect(page.getByRole("status")).toContainText(
    "备份已创建并通过完整性检查",
  );
  await page.getByRole("button", { name: "恢复", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "确认恢复", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("请输入「恢复当前工作台」以确认").fill("wrong");
  await expect(
    dialog.getByRole("button", { name: "确认恢复", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "恢复", exact: true }).first().click();
  await dialog
    .getByLabel("请输入「恢复当前工作台」以确认")
    .fill("恢复当前工作台");
  await dialog.getByRole("button", { name: "确认恢复", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("恢复完成");
  await expect(page.locator(".backup-list li")).toHaveCount(beforeCount + 2);
});

test("服务异常时明确报错而不虚报连接成功", async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "TEST_OFFLINE", message: "测试：本地服务不可用" },
      }),
    }),
  );
  await page.goto("/settings");
  await expect(page.getByRole("alert")).toContainText("测试：本地服务不可用");
  await expect(page.getByText("本地服务未连接")).toBeVisible();
  await expect(page.getByRole("button", { name: "创建备份" })).toBeDisabled();
});
