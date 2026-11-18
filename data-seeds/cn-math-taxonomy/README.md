> 2026-11-19最新调整：图谱已迁入独立SQLite及/chemistry-graph空间，五业务入口；旧50条上海映射建议仅作历史归档，不再用于新图谱导航。以下早期说明用于历史追溯，当前架构及操作以phase-03-independent-chemistry-graph-report.md为准。

# cn-math-taxonomy 初中化学数据快照

来源：https://github.com/xiaoyang111222/cn-math-taxonomy
固定commit：aa2c22058222d0df404f1819e2fbdb97a62049ea
署名：xiaoyang111222 / cn-math-taxonomy 及其贡献者。
许可：CC BY-NC 4.0，完整原始LICENSE随目录保留。许可链接：https://creativecommons.org/licenses/by-nc/4.0/ 。保留署名、来源和更改说明；非商业教学使用。本项目未获商业授权。

source.json仅收录45个cnk_j初中化学知识点、180题、80条内部先修边，未包含其他学科或高中化学。manifest保留原始文件SHA256与转换PNG校验值。upstream-questions.md为上游题库格式说明快照，其中的历史全库统计不是本次导入统计依据；以source.json和本项目实际数据库为准。

mapping-rules.json为本项目基于知识含义整理的50条上海课题**建议**，覆盖44个知识点；未套用上游人教版单元编号，未修改六主题教材目录。所有建议等待教师确认；cnk_j022一氧化碳暂无明确对应课题。目录来源核实限制仍见上一份教材导入报告。

images/含48张转换后PNG。仅接受svg/text/circle/line/rect/path/polygon/ellipse基础标签及有限绘图属性；拒绝脚本、事件属性、外链、url()、foreignObject等。通过XML白名单校验后，使用无JavaScript、禁止网络的隔离浏览器转为白底PNG；导入时再经Pillow校验和重编码。原SVG仅作为来源JSON中的转义数据保存，不作为HTML执行或直接对外提供。

变更：选择题按原选项顺序写入结构化题干，答案同时保留字母与原选项文本；numeric转计算题，保留原数值答案和原始作答规则；basic→1、standard→3、advanced/challenge→4。当前实际为90 basic、45 standard、45 challenge。不执行verify，不声称已核验所有题目教学正确性。所有题目和知识点待审核。

导入命令（在项目根目录）：

```sh
# 先关闭本项目服务；会通过Storage检查归属并安全升级迁移
backend/.venv/bin/python scripts/import_chem_taxonomy.py > /tmp/chem-taxonomy-preview.json
# 审阅预览；此任务已获项目所有者导入授权
backend/.venv/bin/python scripts/import_chem_taxonomy.py --apply
./scripts/start.sh
```

也可在题库→知识图谱→导入预览与管理查看和重复执行。实际导入前先验证完整数据库及附件备份；导入单事务，失败清理本次新附件并回滚记录；固定来源版本幂等，不覆盖教师已有数据。新commit更新需要新的审阅流程，本脚本不自动联网同步。

审核：知识图谱可逐项确认知识点、先修关系和章节映射。先修关系需先审核两端知识点，章节映射需先审核当前知识点。正式映射/关系仅在明确确认后建立；辅助来源记录始终保留hard/soft、理由、原ID和来源版本。题目使用现有题目详情审核流程。映射可以通过知识点主库手动增加或调整，图谱同步展示正式关联。

尚不支持的新题型、无效选项、损坏图片会保留完整原始记录并标记unsupported，在预览和图谱题目列表可见，不丢弃后宣称成功。
