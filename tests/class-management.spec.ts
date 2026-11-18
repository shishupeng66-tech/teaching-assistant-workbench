import { test, expect } from "../frontend/node_modules/@playwright/test/index";
import type { Page } from "../frontend/node_modules/@playwright/test/index";
import { execFileSync } from "node:child_process";

async function createClass(page: Page, name: string) {
  await page.getByRole("button", { name: "新建班级", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("班级名称", { exact: true }).fill(name);
  await drawer.getByLabel("学年", { exact: true }).fill("2026-2027");
  await drawer.getByLabel("年级", { exact: true }).fill("七年级");
  await drawer.getByLabel("班级编号", { exact: true }).fill("1");
  await drawer.getByRole("button", { name: "保存班级", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByLabel("班级切换")).toContainText(name);
  return await page.getByLabel("班级切换").inputValue();
}
async function addStudent(page: Page, name: string, number: string) {
  await page.getByRole("button", { name: "添加学生", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("学生姓名", { exact: true }).fill(name);
  await drawer.getByLabel("学号（可选）", { exact: true }).fill(number);
  await drawer.getByRole("button", { name: "保存学生", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(
    page.locator(".roster-grid").getByRole("link", { name, exact: true }),
  ).toBeVisible();
}

test("真实教室：新增、选择排座、拖拽交换、清空、详情、转班和学生归档", async ({
  page,
}) => {
  await page.goto("/");
  const original = await createClass(page, "UI 模拟一班");
  const target = await createClass(page, "UI 模拟二班");
  await page.getByLabel("班级切换").selectOption(original);
  await addStudent(page, "UI 模拟甲", "UI001");
  await addStudent(page, "UI 模拟乙", "UI002");
  await page.getByRole("button", { name: "安排座位", exact: true }).click();
  await page.getByLabel("教室行数", { exact: true }).fill("2");
  await page.getByLabel("教室列数", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "1排1列 空座位", exact: true })
    .click();
  await page
    .getByLabel("为选中座位选择学生")
    .selectOption({ label: "UI 模拟甲 · UI001" });
  await page
    .getByRole("button", { name: "1排2列 空座位", exact: true })
    .click();
  await page
    .getByLabel("为选中座位选择学生")
    .selectOption({ label: "UI 模拟乙 · UI002" });
  await page.getByRole("button", { name: "保存座位布局", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("座位布局已保存");
  await page.reload();
  await expect(page.locator(".seat")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "1排1列 UI 模拟甲", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "安排座位", exact: true }).click();
  await page
    .getByRole("button", { name: "1排1列 UI 模拟甲", exact: true })
    .dragTo(
      page.getByRole("button", { name: "1排2列 UI 模拟乙", exact: true }),
    );
  await expect(
    page.getByRole("button", { name: "1排1列 UI 模拟乙", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "1排2列 UI 模拟甲", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存座位布局", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "安排座位", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "安排座位", exact: true }).click();
  await page
    .getByRole("button", { name: "1排1列 UI 模拟乙", exact: true })
    .click();
  await page.getByLabel("为选中座位选择学生").selectOption("");
  await page.getByRole("button", { name: "保存座位布局", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "1排1列 空座位", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "1排2列 UI 模拟甲", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "UI 模拟甲", exact: true }),
  ).toBeVisible();
  const permanentId = page.url().split("/").pop()!;
  await expect(page.getByText("1 排 2 列", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  await page.getByRole("dialog").getByLabel("备注（可选）").fill("UI 测试备注");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存学生", exact: true })
    .click();
  await expect(
    page.getByText("UI 测试备注", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "转班", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("目标班级", { exact: true })
    .selectOption(target);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认转班", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("转班完成");
  await expect(
    page.getByText("UI 模拟二班 · 2026-2027", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("未安排", { exact: true })).toBeVisible();
  await expect(page.locator(".history-table tbody tr")).toHaveCount(2);
  expect(page.url()).toContain(permanentId);
  await page.getByRole("button", { name: "归档学生", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "确认归档学生" }),
  ).toBeDisabled();
  await page.getByRole("dialog").getByLabel("输入“确认归档”").fill("确认归档");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认归档学生", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("学生已归档");
  await expect(
    page.getByRole("button", { name: "编辑资料", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "返回教室", exact: true }).click();
  await page.getByRole("button", { name: "学生管理", exact: true }).click();
  await page.getByRole("dialog").getByLabel("查看已归档学生").check();
  await page.getByRole("dialog").getByLabel("搜索全部学生").fill("UI 模拟甲");
  await expect(
    page.getByRole("dialog").getByRole("link").filter({ hasText: "UI 模拟甲" }),
  ).toBeVisible();
});

test("班级修改、归档查看和相同班名区分", async ({ page }) => {
  await page.goto("/");
  const id = await createClass(page, "UI 班级设置测试");
  await page.getByRole("button", { name: "班级设置", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByLabel("班级名称", { exact: true }).fill("UI 已修改班级");
  await drawer.getByLabel("学年", { exact: true }).fill("2027-2028");
  await drawer.getByRole("button", { name: "保存班级", exact: true }).click();
  await expect(page.getByLabel("班级切换")).toContainText("UI 已修改班级");
  await page.getByRole("button", { name: "班级设置", exact: true }).click();
  await drawer.getByRole("button", { name: "归档此班级", exact: true }).click();
  await drawer.getByLabel("输入“确认归档”").fill("确认归档");
  await drawer
    .getByRole("button", { name: "确认归档班级", exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  await page.getByLabel("查看已归档班级").check();
  await page.getByLabel("班级切换").selectOption(id);
  await expect(page.getByLabel("班级切换")).toHaveValue(id);
  await expect(
    page.getByRole("button", { name: "安排座位", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "添加学生", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("班级切换")).toHaveValue(id);
});

function excel(rows: unknown[][]) {
  return execFileSync("../backend/.venv/bin/python", [
    "-c",
    `import io,sys,json\nfrom openpyxl import Workbook\nw=Workbook();s=w.active;s.title='学生导入';s.append(['姓名','学号','性别','入学年份','备注'])\nfor row in json.loads(sys.argv[1]):s.append(row)\nb=io.BytesIO();w.save(b);sys.stdout.buffer.write(b.getvalue())`,
    JSON.stringify(rows),
  ]);
}

test("Excel 预览错误、跳过重复导入与重复文件保护", async ({ page }) => {
  await page.goto("/");
  await createClass(page, "UI Excel 测试班");
  await addStudent(page, "UI 原有学生", "EX001");
  await page.getByRole("button", { name: "Excel 导入", exact: true }).click();
  const drawer = page.getByRole("dialog");
  const file = drawer.getByLabel("选择 Excel 文件");
  await file.setInputFiles({
    name: "bad.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: excel([[null, "EX009"]]),
  });
  await drawer.getByRole("button", { name: "校验并预览" }).click();
  await expect(drawer.locator(".import-summary")).toContainText("错误 1 条");
  await expect(
    drawer.getByRole("button", { name: "确认导入", exact: true }),
  ).toBeDisabled();
  const valid = {
    name: "valid.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: excel([
      ["禁止覆盖", "EX001"],
      ["UI 新学生", "EX002"],
    ]),
  };
  await file.setInputFiles(valid);
  await drawer.getByRole("button", { name: "校验并预览" }).click();
  await expect(drawer.locator(".import-summary")).toContainText("重复 1 条");
  await drawer.getByLabel("重复记录处理").selectOption("skip");
  await drawer.getByRole("button", { name: "确认导入", exact: true }).click();
  await expect(drawer.getByRole("status")).toContainText(
    "新增 1 人，跳过 1 条",
  );
  await file.setInputFiles(valid);
  await drawer.getByRole("button", { name: "校验并预览" }).click();
  await expect(drawer.getByRole("status")).toContainText("没有重复新增");
  await drawer.getByRole("button", { name: "关闭侧边栏" }).click();
  await expect(page.locator(".roster-student")).toHaveCount(2);
});
