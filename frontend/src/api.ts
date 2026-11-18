export type SystemSettings = {
  name: string;
  version: string;
  data_dir: string;
  backup_dir: string;
  database: { connected: boolean; migration: string };
};
export type Backup = {
  name: string;
  size: number;
  created_at: string;
  valid: boolean;
  asset_count?: number;
};
export async function api<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body ? "POST" : "GET",
    headers: body
      ? { "Content-Type": "application/json", "X-Workbench-Request": "1" }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error?.message || "请求失败，请检查本地服务");
  return data as T;
}

export async function upload<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "X-Workbench-Request": "1" },
    body,
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "上传失败");
  return data as T;
}
