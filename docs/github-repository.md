# GitHub源码与教学资料保存说明

2026-11-19项目所有者明确授权建立本人账号下的独立公开仓库（所有者随后明确授权公开）：

https://github.com/shishupeng66-tech/teaching-assistant-workbench

仓库承接现有项目，不部署网站、不启用云端服务、不改变本地数据与端口。后续阶段仍须项目所有者授权；推送不代表阶段验收通过。

## 本次随仓库保存的教学资料

| 内容 | 路径 | 规模/说明 |
| --- | --- | --- |
| 当前六主题教材目录及题库内容快照 | data-seeds/repository-library-snapshot/ | 65个目录节点、64个知识点、192道原创练习、536条候选关联，保留永久ID和审核状态 |
| 原创内容与可重复构建文件 | data-seeds/textbook-chemistry-content/ | 64知识点、192题，全部待教师审核；不是官方教材试题 |
| 教材目录来源与结构化种子 | data-seeds/textbooks/shanghai-junior-chemistry/ | 保留来源版本、核实限制；初始化后合并为初中化学六主题 |
| 独立图谱来源资料 | data-seeds/cn-math-taxonomy/ | 45知识点、180题、80先修关系、48张PNG；仅独立空间，保留CC BY-NC 4.0 |
| 化学互动课件 | frontend/src/features/chemistry-lab/ | 10项真实交互实验，中文配置、科学计算及3D场景 |
| 课件本地字体资源 | frontend/public/chemistry-lab/ | 本地字体、Unicode补字、覆盖统计和字体许可证 |
| 上游课件署名和许可 | third-party/sciencelab3d/ | MIT、固定commit、来源与更改哈希、源码审查记录 |

当前教材题库没有被引用的图片附件，图谱的48张题图已随来源资料保留。独立图谱数据库中的教师练习记录及当前浏览状态不上传。收藏在本机浏览器，可在“我的收藏”单独导出；不上传浏览器私人数据。

题库JSON快照从只读事务中的白名单表导出，不含班级、学生、座位、全局审计、数据库实例标识和凭据。其哈希和数量见manifest.json。这个JSON不是数据库恢复文件，不应直接覆盖现有正式库；教师的本机正式业务数据与备份继续在用户级应用目录保存。

## 从新电脑或全新目录运行

```bash
git clone https://github.com/shishupeng66-tech/teaching-assistant-workbench.git
cd teaching-assistant-workbench
./scripts/setup.sh
./scripts/start.sh
```

仓库公开，任何人均可读取和克隆；推送修改仍需要所有者授权的GitHub身份。Node推荐24 LTS，Python3.11及以上。课件随源码可直接使用，首次安装依赖需要互联网，运行实验资源不依赖外网。

**全新数据库不会因启动就擅自灌入教学资料。** 若需要复现题库，请先关闭本项目服务，在全新独立数据目录中配置.env的TAW_DATA_DIR与TAW_BACKUP_DIR；确认不是其他项目数据。按顺序使用既有脚本：

```bash
# 先查看目录导入预览
backend/.venv/bin/python scripts/import_shanghai_chemistry.py
# 核对后初始化已授权的教材目录，并合并成当前六主题
backend/.venv/bin/python scripts/import_shanghai_chemistry.py --apply
backend/.venv/bin/python scripts/consolidate_chemistry.py
# 预览后导入待审核原创内容
backend/.venv/bin/python scripts/seed_textbook_content.py
backend/.venv/bin/python scripts/seed_textbook_content.py --apply
# 可选：仅初始化独立图谱空间，不混入教材题库
backend/.venv/bin/python scripts/import_chem_taxonomy.py --apply
./scripts/start.sh
```

以上初始化适用于新实例；不要在未知或有冲突的已有正式库上盲目执行。既有脚本具有项目身份、文件锁、幂等和备份保护；它们不会因为Git上传而自动执行。完整保留现有学生、历史记录和教师操作状态应使用本机系统设置的受控备份/恢复，不能依赖源码仓库。

## 许可与保密

保留各第三方自己的许可和署名，不能将整个资料集一概声明为MIT；cn-math-taxonomy资料为CC BY-NC 4.0，仍限非商业用途。课件MIT及字体OFL/Arphic等分别见对应目录。

.gitignore排除.env、数据库、备份、日志、学生导入文件、依赖目录及构建产物。GitHub仓库用于保存源码和教学资料，不自动同步运行中的数据库。
