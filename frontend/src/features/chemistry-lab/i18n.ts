import zhCN from "./locales/zh-CN.json";
export const locale = "zh-CN";
export const messages: Record<string, string> = zhCN;
export function t(key: string): string {
  return messages[key] ?? key;
}
