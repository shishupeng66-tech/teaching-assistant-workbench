import { Link } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import {
  X,
  AlertCircle,
  Check,
  BookOpen,
  Sun,
  Moon,
  Database,
  HardDrive,
  Download,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Badge, PageTitle } from "../components/common";
import { api } from "../api";
import type { SystemSettings, Backup } from "../api";
function RestoreDialog({
  backup,
  busy,
  onClose,
  onRestore,
}: {
  backup: Backup;
  busy: boolean;
  onClose: () => void;
  onRestore: () => void;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="restore-dialog"
      aria-labelledby="restore-title"
    >
      <div className="dialog-heading">
        <h2 id="restore-title">确认恢复当前工作台</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="关闭恢复确认"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </Button>
      </div>
      <p>
        恢复会替换本实例的当前数据库。系统会先创建恢复前备份，仅接受同一工作台实例且完整性检查通过的文件。
      </p>
      <code>{backup.name}</code>
      <label htmlFor="restore-confirm">请输入「恢复当前工作台」以确认</label>
      <input
        id="restore-confirm"
        autoComplete="off"
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="dialog-actions">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          取消
        </Button>
        <Button
          disabled={text !== "恢复当前工作台" || busy}
          onClick={onRestore}
        >
          {busy ? "正在恢复…" : "确认恢复"}
        </Button>
      </div>
    </dialog>
  );
}
export default function SystemSettingsPage({
  theme,
  setTheme,
}: {
  theme: string;
  setTheme: (theme: string) => void;
}) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Backup | null>(null);
  async function load() {
    try {
      const [s, b] = await Promise.all([
        api<SystemSettings>("/settings"),
        api<{ items: Backup[] }>("/backups"),
      ]);
      setSettings(s);
      setBackups(b.items);
      setError("");
    } catch (e) {
      setSettings(null);
      setError(e instanceof Error ? e.message : "连接失败");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function createBackup() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const b = await api<{ name: string }>("/backups", {});
      setMessage(`备份已创建并通过完整性检查：${b.name}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "备份失败");
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api<{ safety_backup: string }>("/backups/restore", {
        name: selected.name,
        confirmation: "恢复当前工作台",
      });
      setMessage(`恢复完成。恢复前副本：${r.safety_backup}`);
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="SETTINGS / 本地工作空间"
        title="系统设置"
        description="管理工作台外观、本地存储与数据安全。"
      />
      {error && (
        <div className="alert error" role="alert">
          <AlertCircle size={18} />
          {error}
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            重新连接
          </Button>
        </div>
      )}
      {message && (
        <div className="alert success" role="status">
          <Check size={18} />
          <span>{message}</span>
        </div>
      )}
      <div className="settings-grid">
        <section className="card settings-card">
          <h2>
            <BookOpen size={18} />
            关于工作台
          </h2>
          <dl>
            <div>
              <dt>系统名称</dt>
              <dd>教学辅助工作台</dd>
            </div>
            <div>
              <dt>当前版本</dt>
              <dd>
                v0.3.0 <Badge>第三阶段</Badge>
              </dd>
            </div>
            <div>
              <dt>使用方式</dt>
              <dd>教师本机使用</dd>
            </div>
          </dl>
        </section>
        <section className="card settings-card">
          <h2>
            <Sun size={18} />
            外观设置
          </h2>
          <p>选择适合你的工作环境，偏好保存在当前浏览器。</p>
          <div className="theme-options">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
            >
              <Sun size={18} />
              浅色模式
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
            >
              <Moon size={18} />
              深色模式
            </Button>
          </div>
        </section>
      </div>
      <section className="card settings-card storage-card">
        <h2>
          <Database size={18} />
          本地数据存储
        </h2>
        <dl>
          <div>
            <dt>数据库状态</dt>
            <dd>
              <span className={`connection ${settings ? "online" : ""}`}>
                {settings ? "已连接 · SQLite" : "未连接"}
              </span>
              {settings && (
                <small>迁移版本 {settings.database.migration}</small>
              )}
            </dd>
          </div>
          <div>
            <dt>业务数据目录</dt>
            <dd>
              <code>{settings?.data_dir || "等待服务响应…"}</code>
            </dd>
          </div>
          <div>
            <dt>独立备份目录</dt>
            <dd>
              <code>{settings?.backup_dir || "等待服务响应…"}</code>
            </dd>
          </div>
        </dl>
      </section>
      <section className="card settings-card">
        <div className="backup-heading">
          <div>
            <h2>
              <HardDrive size={18} />
              数据备份与恢复
            </h2>
            <p>生成独立数据库及附件副本，并检查完整性及实例归属。</p>
          </div>
          <Button
            disabled={busy || !settings}
            onClick={() => void createBackup()}
          >
            <Download size={16} />
            {busy ? "处理中…" : "创建备份"}
          </Button>
        </div>
        <div className="backup-warning">
          <ShieldCheck size={16} />
          恢复前自动保留副本。数据库文件与同名 .assets
          附件目录须成对保管；不接受其他实例、未知或损坏备份。
        </div>
        {backups.length === 0 ? (
          <div className="backup-empty">
            还没有备份。点击「创建备份」，为当前工作台保存一个安全副本。
          </div>
        ) : (
          <ul className="backup-list">
            {backups.map((b) => (
              <li key={b.name}>
                <div>
                  <code>{b.name}</code>
                  <small>
                    {new Date(b.created_at).toLocaleString("zh-CN")} ·{" "}
                    {(b.size / 1024).toFixed(0)} KB · {b.asset_count || 0}{" "}
                    张图片 · {b.valid ? "检查通过" : "不可用 / 检查失败"}
                  </small>
                </div>
                <Button
                  variant="outline"
                  disabled={busy || !settings || !b.valid}
                  onClick={() => setSelected(b)}
                >
                  <RotateCcw size={14} />
                  恢复
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected && (
        <RestoreDialog
          backup={selected}
          busy={busy}
          onClose={() => setSelected(null)}
          onRestore={() => void restore()}
        />
      )}
      <section
        className="card settings-card"
        style={{ padding: 24, marginTop: 20 }}
      >
        <h2>独立化学知识图谱备份</h2>
        <p>
          上方主工作台备份包含班级、学生、教材题库及历史记录，不包含独立化学图谱数据库、浏览状态和教师练习。请分别备份，恢复互不替换。
        </p>
        <Button asChild variant="outline">
          <Link to="/chemistry-graph/data">管理独立图谱备份与恢复</Link>
        </Button>
      </section>
    </>
  );
}
