from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TAW_", extra="ignore")
    data_dir: Path = (
        Path.home() / "Library/Application Support/TeachingAssistantWorkbench/data"
    )
    backup_dir: Path = (
        Path.home() / "Library/Application Support/TeachingAssistantWorkbench/backups"
    )

    def checked(self):
        for path in (self.data_dir, self.backup_dir):
            if not path.is_absolute():
                raise ValueError("数据和备份目录必须使用绝对路径")
            if path.is_symlink() or path.resolve() != path:
                raise ValueError("数据和备份目录不得包含符号链接或相对片段")
        if (
            self.data_dir == self.backup_dir
            or self.data_dir in self.backup_dir.parents
            or self.backup_dir in self.data_dir.parents
        ):
            raise ValueError("数据和备份目录必须相互独立，不能嵌套")
        return self
