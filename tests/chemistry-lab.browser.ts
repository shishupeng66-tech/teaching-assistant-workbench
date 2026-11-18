import { test, expect } from "../frontend/node_modules/@playwright/test/index";
import fs from "node:fs";
import path from "node:path";
const experiments = JSON.parse(
  fs.readFileSync(
    path.resolve("src/features/chemistry-lab/locales/experiments.zh-CN.json"),
    "utf8",
  ),
);
for (const exp of experiments)
  test(`${exp.title}：本地3D、参数、暂停、重置、漏译与刷新`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [],
      outside: string[] = [],
      failures: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("requestfailed", (r) => failures.push(r.url()));
    await page.route("**/*", (r) => {
      const url = r.request().url();
      if (/^https?:/.test(url) && !url.startsWith("http://127.0.0.1:5188")) {
        outside.push(url);
        return r.abort();
      }
      return r.continue();
    });
    await page.goto("/chemistry-lab/" + exp.id);
    await expect(
      page.getByRole("heading", { name: exp.title, exact: true }),
    ).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();
    await page.waitForFunction(
      () =>
        Number(document.querySelector("canvas")?.dataset.geometries) > 2 &&
        Number(document.querySelector("canvas")?.dataset.drawCalls) > 1,
    );
    // 等待完整模型与本地文字至少完成一次渲染同步，避免只检查空canvas。
    await expect(page.locator(".lab-scene-error")).toHaveCount(0);
    const first = exp.controls[0];
    const input = page
      .locator(".lab-parameters")
      .locator(first.kind === "select" ? "select" : "input[type=range]")
      .first();
    const before = await input.inputValue();
    if (first.kind === "select") await input.selectOption({ index: 1 });
    else {
      await input.focus();
      await input.press("ArrowRight");
    }
    expect(await input.inputValue()).not.toBe(before);
    if (exp.id === "atomic-structure") {
      await expect(page.locator(".lab-readings")).toContainText("氮");
      await expect(page.locator(".lab-readings")).toContainText("2，5");
    }
    if (exp.id === "crystal-lattice")
      await expect(page.locator(".lab-readings")).toContainText("8");
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const time = await page.locator("canvas").getAttribute("data-sim-time");
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    expect(await page.locator("canvas").getAttribute("data-sim-time")).toBe(
      time,
    );
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await page.waitForFunction(
      (time) =>
        Number(document.querySelector("canvas")?.dataset.simTime) >
        Number(time),
      time,
    );
    await page.getByRole("button", { name: "重置实验", exact: true }).click();
    await expect(input).toHaveValue(String(first.default));
    await page.waitForFunction(
      () => Number(document.querySelector("canvas")?.dataset.geometries) > 2,
    );
    await page
      .getByRole("button", { name: "操作与教学说明", exact: true })
      .first()
      .click();
    await expect(page.locator(".lab-guide")).toContainText(exp.limits);
    await page.locator(".lab-guide-close").click();
    const words =
      (await page.locator(".chem-lab-player").innerText()).match(
        /[A-Za-z]{3,}/g,
      ) || [];
    expect(
      [...new Set(words)].filter(
        (w) =>
          ![
            "ScienceLab",
            "mol",
            "kPa",
            "NaCl",
            "HCl",
            "NaOH",
            "COOH",
            "FCC",
            "BCC",
            "HCP",
            "MIT",
          ].includes(w),
      ),
    ).toEqual([]);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(exp.id + ".png") });
    await page.reload();
    await expect(page.locator("canvas")).toBeVisible();
    await page.waitForFunction(
      () => Number(document.querySelector("canvas")?.dataset.geometries) > 2,
    );
    expect(errors).toEqual([]);
    expect(outside).toEqual([]);
    expect(failures.filter((u) => !u.includes("?t="))).toEqual([]);
  });
test("收藏、导出导入与分类搜索", async ({ page }) => {
  await page.goto("/chemistry-lab");
  await expect(page.locator(".lab-course-card")).toHaveCount(10);
  await page
    .getByRole("button", { name: "收藏课件：原子结构", exact: true })
    .click();
  await page.getByRole("button", { name: "我的收藏", exact: true }).click();
  await expect(page.locator(".lab-course-card")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "我的收藏", exact: true }).click();
  await expect(page.locator(".lab-course-card")).toHaveCount(1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出收藏" }).click();
  expect((await download).suggestedFilename()).toBe(
    "chemistry-lab-favorites.json",
  );
  await page.getByLabel("导入收藏", { exact: true }).setInputFiles({
    name: "favorites.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 1, favorites: ["gas-laws"] }),
    ),
  });
  await expect(page.getByRole("status")).toContainText("收藏已导入");
  await expect(page.locator(".lab-course-card")).toContainText("气体定律");
  await page.getByLabel("导入收藏", { exact: true }).setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 1, favorites: ["../physics"] }),
    ),
  });
  await expect(page.getByRole("alert")).toContainText("格式不正确");
  await page.getByRole("button", { name: "全部化学课件", exact: true }).click();
  await page.getByRole("button", { name: "微观结构", exact: true }).click();
  await expect(page.locator(".lab-course-card")).toHaveCount(4);
  await page.getByLabel("搜索课件").fill("晶体");
  await expect(page.locator(".lab-course-card")).toHaveCount(1);
});
test("桌面大屏、移动窗口、主题与全屏", async ({ page }) => {
  await page.goto("/chemistry-lab");
  await page
    .getByRole("button", { name: "切换为深色模式", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".lab-course-card")).toHaveCount(10);
  for (const width of [1920, 1440, 1280, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `width=${width}`,
    ).toBeTruthy();
  }
  await page.goto("/chemistry-lab/gas-laws");
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "显示参数", exact: true }).click();
  await expect(page.locator(".lab-parameters")).toBeVisible();
  await page.getByRole("button", { name: "收起参数", exact: true }).click();
  await page.getByRole("button", { name: "显示观察", exact: true }).click();
  await expect(page.locator(".lab-data")).toBeVisible();
  await page.getByRole("button", { name: "收起观察", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "全屏展示", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBeTruthy();
  await page.getByRole("button", { name: "退出全屏", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBeFalsy();
  await page.getByRole("link", { name: "返回课件列表", exact: true }).click();
  await page
    .getByRole("button", { name: "切换为浅色模式", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("罕见元素字本地字形、点击元素与关键计算反馈", async ({ page }) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    if (
      /^https?:/.test(r.url()) &&
      !r.url().startsWith("http://127.0.0.1:5188")
    )
      outside.push(r.url());
  });
  await page.route("**/*", (r) =>
    r.request().url().startsWith("http://127.0.0.1:5188") ||
    !/^https?:/.test(r.request().url())
      ? r.continue()
      : r.abort(),
  );
  const font = page.waitForResponse((r) =>
    r.url().includes("/unicode/font-files/lab-rare/"),
  );
  await page.goto("/chemistry-lab/periodic-trends");
  expect((await font).ok()).toBeTruthy();
  await page
    .getByRole("slider", { name: "原子序数 Z", exact: true })
    .fill("116");
  await expect(page.locator(".lab-readings")).toContainText("𫟷");
  const bounds = await page.locator("canvas").boundingBox();
  if (!bounds) throw new Error("Canvas missing");
  const scale =
    bounds.height /
    (2 * Math.tan((25 * Math.PI) / 180) * (19 - (53 / 350) * 3));
  await page.locator("canvas").click({
    position: {
      x: bounds.width / 2 - 8.5 * scale,
      y: bounds.height / 2 - 3.5 * scale,
    },
  });
  await expect(page.locator(".lab-readings strong")).toContainText("氢");
  expect(outside).toEqual([]);
  await page.goto("/chemistry-lab/gas-laws");
  await expect(page.locator(".lab-readings")).toContainText("49.88");
  await page.getByRole("slider", { name: "体积 V", exact: true }).fill("10");
  await expect(page.locator(".lab-readings")).toContainText("24.94");
  await page.goto("/chemistry-lab/acid-base-reactions");
  await page.getByRole("slider", { name: "酸的浓度", exact: true }).fill("0.5");
  await expect
    .poll(async () =>
      Number(await page.locator(".lab-readings dd").first().textContent()),
    )
    .toBeLessThan(2);
});
