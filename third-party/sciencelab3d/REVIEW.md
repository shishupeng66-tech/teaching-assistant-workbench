# ScienceLab 3D：源码审查与移植边界

上游： https://github.com/rudra496/sciencelab3d
固定commit：939d9300ea04fc0b6c22b1a5cfc8cbd8ee480c80
作者：Rudra Sarker；许可证：MIT，原文保留在本目录LICENSE。UPSTREAM.json记录未改动来源文件的SHA-256；改动版在frontend/src/features/chemistry-lab/scenes。

## 实际存在的10项化学场景

| 上游ID | 场景与功能 | 来源依赖 |
| --- | --- | --- |
| atomic-structure | 原子核、前20元素、电子层与运动轨迹 | React、R3F、Three、Drei Line |
| chemical-bonding | 离子键、共价键、金属电子海，分步动画 | React、R3F、Three、Drei Line/Html |
| electrolysis | 电极、电源、气泡、收集管、步骤 | React、R3F、Three、Drei Line/Text |
| titration | 滴定管、液滴、指示剂、曲线与酸碱参数 | React、R3F、Three、Drei Line |
| gas-laws | 气体碰撞、活塞、P-V曲线和理想气体计算 | React、R3F、Three、Drei Line，上游physics中3个函数 |
| acid-base-reactions | 酸碱混合、离子运动与中和事件 | React、R3F、Three、Drei Line |
| crystal-lattice | FCC/BCC/HCP/金刚石型的坐标、晶胞和连接线 | React、R3F、Three、Drei Line |
| diffusion | 随机游走、膜孔穿越、两侧粒子统计 | React、R3F、Three、Drei Line |
| thermochemistry | 吸放热双场景、分子运动、能量图 | React、R3F、Three、Drei Line/Text |
| periodic-trends | 118元素方块、选择、悬浮信息和来源数据 | React、Three、Drei Text/Html |

上游整体项目另外依赖Next.js、Framer Motion、Leva、后期效果库，化学场景没有实际用到这些依赖，本次没有引入。没有安装物理、生物、数学实验；仅从公共科学公式工具中提取气体场景需要的三式。

## 移植方式与更改

仅移植真实动态场景，使用现有Vite加载；没有iframe或第二套Next.js服务。上游页面存在控制未接入场景等问题，因此重新组织统一中文操作栏和数据区，场景几何、粒子、碰撞、晶格坐标与分步逻辑继续源自这些文件。

- 所有useFrame接入可暂停/调速的虚拟时钟；修正使用Date.now/performance.now导致继续时跳变的源代码。重置完整重挂载并恢复默认参数与镜头。
- Html注释转换为仍锚定原三维坐标的本地SDF中文文字，避免React19切换参数时独立DOM根同步卸载警告；模型和点击事件保留。
- 水电解限定于惰性电极、合适电解质辅助；不提供原本错误套用相同产物的NaCl/CuSO₄选项。气泡及毫升为示意，不提供精密电解产率。
- 理想气体L→m³换算、P-V当前点及图的尺度修正；容器边长按体积立方根变化，修复粒子初始化竞态。
- 中和时消耗H⁺/OH⁻，旁观离子不自动变成NaCl晶体；等体积反应的pH考虑酸碱过量。
- 滴定pH按理想平衡计算，乙酸以电荷/质量守恒求根，避免当量点附近分段不连续；限制50mL示意滴定管容量。
- 吸放热能量路径连续，端点区分±ΔH；活化能不得低于吸热产物能量差。温升仍为示意。
- 周期表增加可调属性高度与平滑过渡，不改动原数据来源身份。部分重元素数值可能缺失或估算，全部标科学复核。

没有把这些课件或题目写入教材题库、知识点、学生档案或知识图谱。收藏是当前浏览器本地数据，可JSON导出/导入，不混入业务数据库。

字体与许可另见frontend/public/chemistry-lab/fonts/README.md；未复制上游未单列来源的HDR图，改用本地程序光照。
