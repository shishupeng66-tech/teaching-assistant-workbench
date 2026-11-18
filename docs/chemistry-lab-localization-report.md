# 化学互动课件：简体中文本地化报告

日期：2026-11-19。默认zh-CN。仅汉化本次接入的10项化学课件，不声称已翻译整个ScienceLab网站或其他学科。

## 资源结构与覆盖

- frontend/src/features/chemistry-lab/locales/zh-CN.json：339项集中字典，含来源场景、118个元素中文名、操作、参数、数据标签、状态、错误、无障碍名称及工具提示。
- locales/experiments.zh-CN.json：10项标题、描述、教学目标、理论、操作参数、上海主题建议与科学模型限制。
- i18n.ts：统一翻译入口。页面不逐个散写中文；上游英文枚举、来源ID、化学式和单位保持原值，展示时翻译。
- 原场景中的英文名称、步骤、讲解、能量标签和状态改走同一字典；富文本Html注释改为三维坐标锚定的本地SDF中文标签，仍随视角变化。

首页、收藏、分类、搜索、加载、暂停、继续、重置、全屏失败、文件错误、参数、指示剂、观测数据、图表坐标/图例和教学说明均覆盖。移动端使用相同资源，不是另一套未翻译组件。

原子电子层人数展示为各层数量，未误写为s/p亚层排布。元素符号、NaCl、H₂O、H⁺、OH⁻、pH、PV=nRT、V、K、L、mL、kPa、mol/L和kJ/mol保留科学含义。

## 术语对照（节选）

| 上游英文 | 中文呈现 |
| --- | --- |
| Atomic Structure | 原子结构 |
| Chemical Bonding | 化学键 |
| Electrolysis | 电解实验 |
| Acid-Base Titration | 酸碱滴定 |
| Gas Laws | 气体定律 |
| Acid-Base Reactions | 酸碱反应 |
| Crystal Lattice Structures | 晶体结构 |
| Molecular Diffusion | 分子扩散 |
| Exothermic / Endothermic | 放热 / 吸热 |
| Periodic Table Trends | 元素周期表规律 |
| Cathode / Anode（电解池） | 阴极 / 阳极 |
| Ionic / Covalent / Metallic | 离子键 / 共价键 / 金属键 |
| Electron Delocalization | 电子离域 |
| Equivalence Point | 当量点 |
| Electronegativity | 电负性 |
| Ionization Energy | 第一电离能 |
| Phenolphthalein | 酚酞 |
| Methyl Orange | 甲基橙 |
| FCC / BCC / HCP | 面心立方 / 体心立方 / 六方最密堆积 |

完整元素名与来源长文本对照就在zh-CN.json：以原英文为键、中文为值，可直接检索。新操作文案使用稳定语义键。

## 本地字体与断网处理

三个字体来源分开保留许可，不混改许可证：

1. Teaching Lab CJK：Noto Sans SC 400字重的本地子集，约210KB，OFL1.1。已按派生字体要求重命名，保留版权、OFL.txt及原文件哈希。生成工具tools/build_lab_cjk_font.py仅开发期使用，运行时无下载。
2. DejaVu Sans：来源仓库已有字体，本地回退覆盖拉丁文、希腊字母、数学符号和上下标，保留DejaVu-LICENSE.txt。
3. Teaching Lab Rare Han：BabelStone Han 16.0.3中的U+2B7F7“𫟷”单字派生子集，约17KB及本地WOFF，保留Arphic Public License全文及Andrew West/Arphic署名，派生字体已重命名。

原Noto字体缺少该罕见元素字；如果不处理，Troika会自动访问CDN。已加入本地解析索引和字形，并以绝对localhost地址配置Worker回退，避免相对地址解析失败后再次联网。118个元素均保留正确中文名称，不用英文名或空框假装汉化。

字体路径frontend/public/chemistry-lab/fonts，coverage.json记录6570个联合字符覆盖及各字体哈希；README.md记录来源与再生成方法。未导入在线字体、模型或纹理；光照程序在本地生成。

## 漏译检查与验证

运行：

```bash
node scripts/check_lab_localization.mjs
```

使用Babel AST检查23个源码文件：静态翻译键必须存在、可见JSX及无障碍属性不能残留未分类英文、组件内不能散落中文、元素名与描述不能仍以英文裸值显示；检查10项课件参数引用及本地字体中文覆盖。当前339字典项、286处静态调用通过；动态参数标签另按课件资源核对。

真实浏览器与Chromium测试逐个打开10项，查看中文操作、模型、数据、说明、刷新与参数反馈；对画面可见文本进行英文单词扫描。化学式CH₃COOH的COOH、单位mol/kPa、元素符号、FCC/BCC/HCP、ScienceLab 3D及MIT是明确保留项，不是漏译。

断网自测拦截所有外部HTTP(S)，保留localhost：10项冷启动及罕见字本地加载均正常，无自动外网请求。不是仅依靠浏览器缓存成功，也没有将外网失败静默隐藏。浏览器强制“离线”若连localhost都禁用，不属于本地服务运行模式。

## 尚未翻译与已知限制

本次已接入界面未发现未处理的普通英文文案。保留来源品牌、MIT、Git commit、化学式、元素符号、单位和必要缩写。代码变量名、来源ID和枚举不翻译；不影响中文界面。

未移植上游整个Next.js详情网站的逐段内容，当前教学说明围绕实际保留模型重新组织，并修正明显科学问题；未导入其他学科。原子仅前20元素可调，周期表含118元素。科学准确性仍须教师复核，重元素数值、HCP/金刚石邻域和热学读数等限制见集成报告。

本次验证Chromium/Tabbit，尚未逐浏览器测试Safari/Firefox。新增字典文字后，应重新执行静态/字体覆盖检查；新增缺字需重新生成本地子集，不能以恢复CDN回退代替处理。
