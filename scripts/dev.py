"""Local supervisor: only terminate processes created by this invocation."""
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)
children = []

def shutdown(signum=None, frame=None):
    for child in children:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
    for child in children:
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
    print("\n教学辅助工作台已停止。数据与备份完整保留。", flush=True)
    if signum:
        raise SystemExit(0)

signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)
try:
    for port in (8087, 5188):
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                raise RuntimeError(f"本机端口 {port} 已被占用。请手动关闭占用服务后重试；本脚本不会停止其他服务。")
    subprocess.run([sys.executable, "-m", "app.manage", "migrate"], cwd=ROOT / "backend", check=True)
    commands = [([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8087"], ROOT / "backend"),
                (["npm", "run", "dev"], ROOT / "frontend")]
    for command, cwd in commands:
        children.append(subprocess.Popen(command, cwd=cwd, start_new_session=True))
    deadline = time.monotonic() + 40
    for url in ("http://127.0.0.1:8087/api/health", "http://127.0.0.1:5188/api/health"):
        while True:
            if any(child.poll() is not None for child in children):
                raise RuntimeError("前端或后端提前退出，请查看上方错误日志")
            try:
                with urllib.request.urlopen(url, timeout=1) as response:
                    if response.status == 200:
                        break
            except (OSError, TimeoutError):
                pass
            if time.monotonic() > deadline:
                raise RuntimeError("启动超时，请查看上方日志")
            time.sleep(.25)
    print("\n教学辅助工作台已就绪\n访问：http://127.0.0.1:5188\n健康检查：http://127.0.0.1:8087/api/health\n在本窗口按 Control+C 关闭前后端。\n", flush=True)
    while True:
        if any(child.poll() is not None for child in children):
            raise RuntimeError("服务异常停止，请查看上方日志。其他本次启动的服务也将关闭。")
        time.sleep(.5)
except Exception as exc:
    print(f"启动失败：{exc}", file=sys.stderr, flush=True)
    shutdown()
    raise SystemExit(1)
