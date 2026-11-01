# 论文绘图与插图重建工具调研

调研日期为 2026 年 10 月 28 日。面向 FastFigure 的产品与工程选型，覆盖论文新图生成、已有插图转可编辑 PPTX 和 draw.io、扫描件整理与 PDF，以及可复用的底层组件。

**FastFigure 的目标是可编辑的计算机论文图件生成、重建和组件复用。** PDF、扫描件格式化和文档解析内容仅作技术参考，不进入产品功能或研发排期；图件来源可以记录论文 PDF 的页码与区域。当前方案见 [素材库](2026-10-28-cs-figure-library.md)、[RSI](2026-10-28-vectorization-rsi.md) 和 [容器样式](2026-10-28-container-styles.md)。

这个定位是基于现有能力分布作出的产品判断。图像生成、科研素材库和 OCR 都已有大量供给；值得优先验证的差异，是重建后修改一个模块、移动节点、统一整篇论文风格，以及在不同格式中保留修改能力。

调研以官方文档、作者仓库和论文为依据。商业产品的能力按厂商描述记录；核心开源方案做了文档或代码静态检查。本文没有把示例图、作者成绩或官网宣传视为我们已经复现的结果，也没有开展付费产品的端到端试用。可核验来源、代码快照树标识和部分文件指纹见 [来源索引](sources.json)。实现建议与验证计划见 [FastFigure 产品与技术方案](2026-10-28-fastfigure-proposal.md)。

## 1 先定义我们要交付的编辑能力

文件后缀不足以判断可编辑程度。建议使用下面的分层作为内部评测口径，不把它当成行业标准。

| 层级 | 用户实际能做什么 | 常见交付 | 对 FastFigure 的意义 |
| --- | --- | --- | --- |
| E0 整图 | 缩放和移动整张图 | PNG、整页图片 PPTX、装着 PNG 的 SVG | 可做预览与底稿 |
| E1 标注 | 修改叠加的标签、箭头，主体仍是底图 | 底图加文字框、遮盖块 | 适合快速改字，需要明确说明 |
| E2 图元 | 分别修改文字、框、路径、颜色 | 语义 SVG、原生 PPTX shapes、draw.io cells | 方法图首版应达到的能力 |
| E3 结构 | 节点移动后连线保持连接，保留容器和分组 | 带端点引用的图模型、连接器 | 方法图的核心产品价值 |
| E4 数据与含义 | 修改数据重画图表，修改公式或模块参数后重排 | 数据表与绘图程序、公式源、参数化组件 | 数据图和科研组件的后续方向 |

E2 图元也可能缺少 E3 结构。几千个可选中路径，既不等于可修改的文字，也不等于有连接关系的图。draw.io 官方明确说明：普通 SVG 导入可以作为图像使用，但不能据此恢复为可编辑的图模型；包含原始 diagram XML 的 SVG 则是另一种情况。[draw.io SVG 导入说明](https://www2.drawio.com/doc/faq/svg-insert)、[带图模型的 SVG 导出](https://www.drawio.com/docs/manual/export/embed-svg/)。

这一差别也符合实际投稿需求。Nature 的图件指南要求文字可读、可编辑，并提醒作者避免把文字转成轮廓、把比例尺和文字压入照片。[Nature 图件规范](https://research-figure-guide.nature.com/figures/preparing-figures-our-specifications/)。因此，文字转路径只能是保真交付的备选方式，不能成为所有输出的默认处理。

## 2 论文新图创作工具

### 2.1 已有编辑器与科研素材工具

| 工具或路线 | 已核验的能力 | 适合的任务 | 对自研的启发与限制 |
| --- | --- | --- | --- |
| [BioRender](https://help.biorender.com/hc/en-gb/articles/39961689934493-Use-BioRender-in-PowerPoint) | 科研绘图；当前官方文档列出付费的 PowerPoint 可编辑导入，使用 shapes 与 text；graphs 仍按图像导入 | 生物医学机制图与实验流程 | 科研组件与模板是重要资产；不能再沿用“BioRender 一律不能导出可编辑 PPT”的旧结论 |
| [Mind the Graph](https://mindthegraph.com/) | 科学插图画布、模板，官网列出 PNG、PDF、TIFF 导出 | 图形摘要、科普与生物插图 | 借鉴素材搜索与图件布局；这些导出格式本身不能证明具有原生 PPTX 或 draw.io 结构 |
| [diagrams.net](https://www.drawio.com/docs/manual/export/export-diagram/) | 原生图模型，XML、SVG、PDF、PNG 等交付；部分格式可以携带图模型 | 流程图、系统结构图、方法图 | 第一阶段编辑器与交换格式的重要候选 |
| [Inkscape](https://inkscape.org/learn/tutorials/) | SVG 编辑，形状、路径、位图描摹等工作流 | 矢量润色、已有图件编辑 | SVG 是合适的开放输出，但图元编辑与语义连接仍需区分 |
| [Adobe Illustrator](https://helpx.adobe.com/illustrator/desktop/use-generative-ai/generate-vector-artwork-from-images.html) | 矢量编辑；当前 Concept to Vector 支持从栅格参考与提示生成可编辑向量 | 专业图件润色、图标重建与创作 | 可作为视觉与矢量质量基准；图元恢复与论文中的文字、数据和连接关系恢复要分开测 |
| [PowerPoint](https://support.microsoft.com/en-au/office/graphics-visuals/edit-svg-images-in-microsoft-365) | 文字、形状与 SVG 的编辑；支持的版本可把 SVG 转成 Office shapes | 与合作者修改、讲稿复用 | 导出的真实使用环境；必须验证目标版本中的文字和分组行为 |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | 白板编辑，JSON 源文件、SVG 和 PNG 导出 | 草图、早期构思 | 可借鉴低门槛交互；投稿级排版需要另外建立约束 |
| [SVGEdit](https://github.com/SVG-Edit/svgedit) | 浏览器 SVG 编辑及可集成的 svgcanvas | SVG 局部修整 | 快速验证矢量编辑可行；科学对象和拓扑需自行补充 |

BioRender 2026 年 10 月 26 日更新的帮助页还指出，PowerPoint 内的修改不会反向同步到 BioRender，更新 slide 会替换对应的 PowerPoint 修改。这说明跨工具同步需要清晰的版本规则，不能仅靠“可导出”解决。[BioRender PowerPoint 工作流](https://help.biorender.com/hc/en-gb/articles/39961689934493-Use-BioRender-in-PowerPoint)。

### 2.2 AI 绘图产品

下表记录产品官方主张，编辑粒度与导出质量仍应通过同一组输入验证。这里不按营销案例或用户数量排序。

| 产品 | 官方列出的工作流 | 可直接借鉴的设计 | 首次试用重点 |
| --- | --- | --- | --- |
| [FigureLabs](https://www.figurelabs.ai/) | 文本、草图、PDF、数据生成 illustration、flowchart、plot；画布修改；SVG、PPTX 导出 | 按任务类型分引擎，统一画布 | 文本是否为真实文本；箭头是否绑定节点；复杂图标的实际表示 |
| [FigPad](https://figpad.ai/) | 科研图生成与参考图工作流，官网宣传可编辑向量输出 | 从草图到修改的连续流程 | 下载样本解包检查；测一次局部修改是否影响其他区域 |
| [SciFig](https://scifig.ai/) | Illustration、DataChart、FlowChart 三条路径；官网列出 layered SVG 与 editable PPTX | 科学插图、数据图、流程图分别处理 | 数据是否保留；PPTX 图表是否为原生 chart；文字与连接器保留情况 |
| [SciFigure 编辑导出工作台](https://scifigure.org/editable-export) | 源图上添加文字、箭头、标记与遮盖层后导出 SVG/PPTX | 快速改标签，成本较低 | 官方明确包含源图与可编辑叠加层，属于 E1 路线，不能当作整图重建 |
| [Napkin](https://help.napkin.ai/en/articles/15950437-exporting-your-presentation) | 通用图解与演示；官方列出 PowerPoint 导出，并说明文字和支持的形状保持可编辑，图像和效果仍是图像 | 按内容选视觉表达、生成后继续修改 | 作为通用产品基准；专门测试科学符号、方法关系与数据来源 |

对 FastFigure 的判断：单纯增加“一句话生成漂亮论文图”很难形成清晰区别。更值得试验的是，用户能否在第一次生成后稳定完成修改，并把修改能力带到合作者使用的工具中。这个判断需要用户访谈与实际编辑任务验证。

### 2.3 数据图与代码驱动图形

| 工具 | 适用任务 | 采用方式 |
| --- | --- | --- |
| [Matplotlib](https://matplotlib.org/stable/api/_as_gen/matplotlib.pyplot.savefig.html) | 统计图、实验结果、定制科学图表 | 保存数据、脚本、依赖与样式，生成 SVG/PDF |
| [ggplot2](https://ggplot2.tidyverse.org/reference/ggsave.html) | R 生态统计图与统一主题 | 保留 R 源与数据，不只保存输出图 |
| [Plotly](https://plotly.com/python/static-image-export/) | 交互分析与静态图导出 | 导入图表定义；注意 WebGL 类型静态矢量输出可能包含栅格部分 |
| [GraphPad Prism](https://www.graphpad.com/guides/prism/latest/user-guide/exporting_options.htm) | 数据图与布局；官方文档列出 SVG、PDF 等向量输出 | 保留 Prism 源工程，导入图件作装配；不要把导出路径当成原始数据 |
| [Origin](https://docs.originlab.com/origin-help/expgraph-to-image/) | 科研图表与布局，多种向量和栅格输出 | 优先读取源工程可提供的数据或开放格式输出，再统一图件风格 |
| [Graphviz](https://graphviz.org/docs/outputs/) | 关系网络、自动节点布局 | 作为图布局与程序化输出候选 |
| [TikZ 与 PGF](https://tikz.dev/) | 公式密集、参数化的技术图 | 作为高级用户源格式或公式组件后端 |
| [WebPlotDigitizer](https://automeris.io/docs/) | 从已有坐标图取出近似数据 | 作为坐标标定与数据提取基线，提取值需要保留来源与不确定性 |

数据图不能仅沿用插画的生成方式。已有原始数据时应由数据渲染；只有截图时，识别结果是数字化估计，不应自动当成原始实验数据。修改数据、重新统计和重新出图，应依赖数据与程序，避免让用户逐个移动几百个散点。

## 3 已有插图转 PPTX 和 draw.io

### 3.1 重建方案对照

| 方案 | 输入与主要实现 | 输出的编辑性质 | 可复用内容 | 主要限制或待验证点 |
| --- | --- | --- | --- | --- |
| [ssmisya drawio figure skill](https://github.com/ssmisya/drawio-figure-skill) | Agent 理解截图后生成 draw.io XML 或 PPTX OpenXML；仓库有最小示例和校验脚本 | 原生文字、形状；图标允许独立素材 | 对象化原则、交付清单、产物检查 | 属于依赖模型的工作流，示例有效不等于任意截图自动恢复；连线端点绑定应单独查验 |
| [Lancelot Xie img2pptx](https://github.com/Lancelot-Xie/img2pptx) | 先恢复语义 SVG、组件清单和模块，再把完整 SVG 嵌入 PPTX | SVG 内部可有真实文字与图元；Office 中进一步转换依赖版本与环境 | 组件清单、分组、局部约束审计 | 仓库明确区分“已经嵌入 SVG”和“已在 PowerPoint 实际转换”；不能直接视为原生 shapes 导出 |
| [BRCOO image2pptx](https://github.com/BRCOO/image2pptx) | 语义 SVG 后，通过 Windows PowerPoint COM 调用转换与取消组合 | 可走 Office 原生对象转换；也有嵌入 SVG 的降级路径 | 转换后再渲染、再检查文本与对象统计 | 完整路径依赖交互式 Windows Office；当前所查仓库没有识别到独立 LICENSE 文件 |
| [svg to drawio](https://github.com/V1rg1lee/svg-to-drawio) | 把 SVG 元素转换为原生 draw.io cells | 支持图形、文字和分组；复杂效果可能降级为嵌入 SVG | 可作为 SVG 导入适配器与转换基线 | 元素转换不会自动推导科学含义；线条端点是否成为语义连接需测 |
| [IMG2XML](https://github.com/lilin-1/IMG2XML) | SAM3 分割、OCR、标准形状恢复，再写 XML | 标准形状可为原生对象；README 明确把箭头按透明图像提取 | 混合分割方案、形状与图片分流 | 视觉箭头保真与节点连接能力不同；依赖模型的许可证需要逐项登记 |
| [radiukpavlo diagram2drawio](https://github.com/radiukpavlo/diagram2drawio) | 传统视觉与 OCR，恢复形状、连接线和标签；支持中间 JSON 修正 | 目标为原生 draw.io | 离线规则基线、中间结果可修正 | 应重点测复杂嵌套、跨越连线和公式，不能用简洁流程图表现推断复杂论文图能力 |
| [px image2pptx](https://github.com/JadeLiu-tech/px-image2pptx) | OCR 文本掩码、LAMA 补背景、文字框重建 | 可编辑文字加修复后的背景，主体通常仍是图像 | 快速改字、背景和文本拆分 | 不恢复图表数据和完整拓扑；密集标签与复杂背景会影响分离 |
| [LRriver AIPPT](https://github.com/LRriver/AIPPT) | 整套幻灯片生成并提供 editable PPTX reconstruction | README 描述文字框、简单线和表格边框，以及分离图像素材 | 生成过程状态、按页修改、导出流程 | 分离素材不等于每个图标内部均可编辑；应与方法图任务分开测 |
| [Banana Slides](https://github.com/Anionex/banana-slides) | 图像生成驱动的幻灯片应用，提供图像或可编辑 PPTX 等输出 | 当前文档列有可编辑导出 | 项目历史、单页修改、模板和文档导入 | 主要交付是幻灯片；方法图细粒度连接关系仍需另测 |
| [Paper2Any](https://github.com/OpenDCAI/Paper2Any) | 历史代码含论文到图、Image2Drawio、PPT 等工作流 | 历史开源方案可作为工程参考 | 多输入流程、任务编排与图模型导出 | 当前 README 已标明开源仓库是 legacy snapshot；活跃的 Nexus Office 商业实现不在仓库内 |

上表中最值得立刻建立对照的是 ssmisya、Lancelot、BRCOO、svg-to-drawio 与一个传统 CV 基线。它们分别覆盖直接原生输出、SVG 中间表示、Office 转换和确定性元素映射，适合拆开比较误差来源。

### 3.2 五条技术路线

| 路线 | 长处 | 成本或缺口 | FastFigure 用法 |
| --- | --- | --- | --- |
| 直接生成原生图模型或 PPTX | 对文字、形状、连接关系控制直接 | 模型易漏细节；字体和排版需要确定性处理 | 方法图的主路线候选 |
| 语义 SVG 后转换 | 开放格式，容易渲染和对照 | SVG 通常缺少节点连接语义；Office 转换有差异 | 作为视觉中间结果与交换格式 |
| OCR 加分割，再恢复图结构 | 可控制哪些区域重建、哪些保留原图 | 细箭头、遮挡、交叉线和对象层级较难 | 栅格图的主解析路线候选 |
| 去文字加背景修复 | 改字快，底图视觉保留较好 | 只有部分编辑能力，修复可能改变细节 | 明确标注的快速改字模式 |
| 纯描摹或像素路径化 | 可保留轮廓或像素观感 | 文字、关系、数据通常没有恢复 | 图标或保真备选，不能独占核心模型 |

应先检查输入中是否已经存在源结构：`.drawio.png` 或 `.drawio.svg` 中可能携带 XML；PPTX 可能已有 shapes；PDF 可能保留文字和矢量绘制命令。能直接读取的对象，应先利用，再进行 OCR 和视觉推断。[draw.io 文件格式](https://github.com/jgraph/drawio/wiki/File-Format)、[PyMuPDF 绘图提取说明](https://pymupdf.readthedocs.io/en/latest/faq/index.html)。

PDF 中的矢量也不等于作者的原始语义模型。字符可能被拆成 glyph，框线与箭头可能是互不关联的路径，分组与连接信息可能在导出时消失。因此，“读到矢量”可以减少几何重建工作，但仍需恢复文字块、容器、端口与图结构。

### 3.3 对话编辑与 Agent 接入

| 方案 | 已有能力 | 对我们的意义 |
| --- | --- | --- |
| [Next AI Draw.io](https://github.com/DayuanJiang/next-ai-draw-io) | 对话生成和修改真实 draw.io 图，截图或草图重绘，选择对象修改，版本比较与恢复，提供 Web、桌面和 MCP 入口 | 应纳入第一批直接对照；可研究选择区域、画布上下文与版本历史的实现，不必从零验证这些产品交互 |
| [官方 draw.io MCP](https://github.com/jgraph/drawio-mcp) | 生成与打开图，图形库搜索，XML 参考，Agent 插件与图件导出；提供不同部署入口 | 是结构化图生成和 Agent 接入的重点基线；它仍不负责完整的论文语义恢复和原生 PPTX 编译 |

这两类方案说明“聊天加 draw.io 编辑器”本身已有充分供给。FastFigure 需要把区别落实到论文图识别、科研组件、修改后关系保持和跨格式交付，而不是只增加聊天面板。这里记录的是现有集成能力，本次没有安装或连接这些服务。

## 4 对指定仓库的判断

仓库为 [neverclover generic pixel svg rebuild](https://github.com/neverclover/generic-pixel-svg-rebuild)。所查树包含 README、许可证和重建手册三个文件，属于给 Agent 使用的方法说明，不是完整的论文绘图应用或通用图结构识别模型。

### 4.1 它实际解决什么问题

手册针对位图做颜色量化，再把同色像素按行编码成矩形，组合为平涂 SVG path，附加离散步骤播放器与像素对比验收。README 所列的误差指标是作者报告的结果。它的目标是小分辨率下的像素复现，而非文字识别或图结构恢复。[重建手册](https://raw.githubusercontent.com/neverclover/generic-pixel-svg-rebuild/main/pixel-svg-reconstruction-generic.md)。

### 4.2 值得借鉴什么

- 固定原图、尺寸、颜色与渲染基线，让差异有可比性。
- 交付预览、差异图和数值报告，把验收变成可重复流程。
- 将重建过程拆成阶段，便于定位颜色、几何或渲染误差。

### 4.3 为什么不能直接成为论文绘图内核

下面是基于表示方式的工程推论：按像素游程生成的路径，不能自动提供可修改的标签、节点与数据；把这些路径转换成 PPTX 也不会补回丢失的含义。文字轮廓依然只是轮廓。原生分辨率下的低误差，还不能保证缩放后的平滑程度与编辑体验。

另外，手册最近颜色中心打标的实现需遍历像素和调色板中心，工作量随二者乘积增长。按 200 万像素和 2048 个中心估算，约为 40.96 亿次像素与中心比较；这只是运算量级估算，不是运行耗时测量。对于方法图，把几千个颜色类还原得很精细，往往不如正确恢复几十个语义对象重要。

**采用建议：借鉴验收方法，把像素路径化保留为实验基线或特殊素材备选。** 方法图走语义对象重建；照片与显微图保留图像；图标可以选择素材替换或轮廓矢量化。仓库标示 GPL-3.0，当前调研没有把其实现复制进 FastFigure。[仓库许可证](https://github.com/neverclover/generic-pixel-svg-rebuild/blob/main/LICENSE)。

## 5 研究论文和生成模型

论文中的自动化系统提供可研究的方法；其作者评测不直接等于 FastFigure 对目标用户和目标文件的效果。

| 研究或项目 | 时间与表示方式 | 对我们的直接价值 | 需要区分的边界 |
| --- | --- | --- | --- |
| [PaperBanana](https://arxiv.org/abs/2601.23265) 与 [官方 PaperVizAgent](https://github.com/google-research/papervizagent) | 2026 年；参考检索、内容与风格规划、生成、批评迭代 | 参考图检索、先规划后生成、分开检查内容和风格 | 官方项目已改名；不能把同名非官方实现混为官方。其图像工作流也不是原生连接器导出器 |
| [AutoFigure](https://arxiv.org/abs/2602.03828) | 2026 年；文本到科学插图与迭代优化 | 长文本内容整理、布局与视觉迭代 | 应与后续 Edit 版分别讨论 |
| [AutoFigure Edit](https://arxiv.org/abs/2603.06674) 与 [代码](https://github.com/ResearAI/AutoFigure-Edit) | 2026 年；生成底图、图标分割、SVG 模板、嵌入编辑器 | 图标与结构分开，允许混合表示；浏览器编辑闭环 | 所查实现有把图标裁剪 PNG 嵌入 SVG 的路径，“SVG 输出”不代表全部图标内部为向量图元 |
| [LiveFigure](https://arxiv.org/abs/2605.23527) 与 [代码](https://github.com/tsinghua-fib-lab/LiveFigure) | 2026 年；规划、生成绘图代码、视觉诊断 | 以真实 PPTX 产物为目标，结合渲染修正 | 所查代码使用 python-pptx 并通过 LibreOffice/PDF 渲染；需要产品化字体、环境和导出稳定性 |
| [FigTree](https://arxiv.org/abs/2609.01006) | 2026 年 9 月；递归分区域生成 SVG 程序 | 层级组件和局部修复，减少整图修改漂移 | 原生 PPTX/draw.io 仍需额外编译与结构映射 |
| [ReFigBench](https://arxiv.org/abs/2609.18844) | 2026 年 9 月；科学总览图重建成可编辑 PowerPoint | 同时评视觉、文字、拓扑与原生文档结构 | 其研究展示了视觉偏好与连接器保留之间的张力，不能只依赖截图分数 |
| [GenAI DrawIO Creator](https://arxiv.org/abs/2601.05162) | 2026 年；LLM 生成及修改 draw.io XML | 结构化生成、XML 校验、增量修改 | 原型与模拟评测不能替代我们的真实复杂图基准 |
| [StarVector](https://github.com/joanrod/star-vector) | 图像到 SVG 模型 | 可作为图标或图形的向量生成候选 | 输出语法有效与科学关系正确是两个问题 |
| [OmniSVG](https://github.com/OmniSVG/OmniSVG) | 统一向量图生成模型 | 可评估素材生成与重建 | 代码许可与数据集许可不同；不能从代码 Apache-2.0 推导数据可任意使用 |

对自研方法的建议，是吸收这些系统中的规划、分解、局部修正与产物评测，而不在第一阶段训练自己的大模型。应先用可替换的视觉模型和 OCR，建立可测的对象模型、编辑流程与导出器，再判断是否需要专门训练。

## 6 矢量化组件

| 方案 | 主要能力 | 推荐放置位置 |
| --- | --- | --- |
| [VTracer](https://github.com/visioncortex/vtracer) | 彩色位图转 SVG，曲线与颜色区域表达 | 图标、装饰素材的自动向量化基线 |
| [Potrace](https://potrace.sourceforge.net/) | 位图轮廓描摹，输出 SVG、PDF 等 | 黑白图标与线稿基线 |
| [DiffVG](https://github.com/BachiLi/diffvg) | 可微分二维向量渲染 | 几何参数优化研究与局部细化 |
| [LIVE](https://github.com/Picsart-AI-Research/LIVE-Layerwise-Image-Vectorization) | 逐层增加可优化曲线路径拟合图像 | 在路径预算受限时评估视觉拟合 |

不建议把“描摹后再做 OCR”作为所有图的固定顺序。对于文字密集方法图，先读取原生文本或识别文字，再恢复框和线，通常更符合交付目标；复杂图标可另走描摹分支。这是待基准验证的工程假设。

## 7 扫描件与 PDF 工具参考

### 7.1 四种任务需要分别命名

| 用户任务 | 真实输出 | 是否恢复可编辑正文 | 推荐路线 |
| --- | --- | --- | --- |
| 图片合成 PDF | 把图片装入 PDF，设定页序和尺寸 | 否 | img2pdf |
| 扫描件清理与归档 | 旋转、纠偏、裁边、去噪、拆双页，加搜索文字层 | 搜索和复制文字；页面主体通常仍是图像 | 预处理、img2pdf、OCRmyPDF；桌面用 NAPS2 |
| 内容识别与重新排版 | 标题、段落、表格、公式、插图组成新文档 | 是，但版式和文字需要校对 | 文档解析器加 DocumentIR，再生成 DOCX/HTML/LaTeX/PDF |
| 扫描件里的图重建 | 裁出 figure，恢复图内文字与图元 | 针对插图 | 进入 FigureIR 重建管线 |

这些任务用于区分参考系统的能力，避免把封装图片、OCR、文档重排和图内对象恢复混为一谈；不对应 FastFigure 的产品入口。

### 7.2 可复用工具

| 工具 | 官方能力或项目定位 | 适合的采用方式 | 边界 |
| --- | --- | --- | --- |
| [img2pdf](https://pypi.org/project/img2pdf/) | 无损图片封装 PDF，部分常见编码可直接嵌入 | 图片转 PDF 的基础组件 | 不自动 OCR、清理或重排 |
| [OCRmyPDF](https://ocrmypdf.readthedocs.io/en/stable/introduction.html) | 扫描 PDF 加 OCR 文字层，支持 PDF/A、纠偏与优化 | 文字层与图像处理分离的参考 | 文档指出其目标是保留 PDF 页面；不会自动恢复论文图对象 |
| [NAPS2](https://www.naps2.com/doc/ocr) | 扫描、页面操作和 OCR；可处理导入的 PDF | 桌面工作流基准与实际可用方案 | 已有文字的页与无文字页处理不同；不等于重新排版 |
| [ScanTailor Advanced](https://github.com/ScanTailor-Advanced/scantailor-advanced) | 扫描页拆分、纠偏、内容区、页边距与变形校正等处理 | 书页、双页与页面清理参考 | 项目明确把扫描、OCR、多页装订排除在范围之外，需接其他工具合成 PDF |
| [unpaper](https://github.com/unpaper/unpaper) | 扫描页面清理，改善后续 OCR 输入 | 作为可选预处理步骤 | 清理强度要对照原图，尤其是细线与小字 |
| [Tesseract](https://github.com/tesseract-ocr/tesseract) | OCR；可输出 hOCR、TSV、PDF 等 | CPU 基线、搜索文字层候选 | 表格结构和复杂科学图需要额外模块 |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | 当前包含 PP-OCRv6、PP-StructureV3、PaddleOCR-VL 等路径 | 中文与中英混排、带坐标的结构识别重点候选 | 选具体模型与部署方式；不能把所有版本视为同一种能力 |
| [Docling](https://github.com/docling-project/docling) | 文档布局、阅读顺序、表格、公式、OCR，结构化 JSON 与多种导出 | 区域解析、坐标与证据关联参考 | 解析文档结构不等于恢复图内节点和连接 |
| [MinerU](https://github.com/opendatalab/MinerU) | 复杂文档转结构化内容、Markdown/JSON 等工作流 | 与 Docling 对照的重点候选 | 当前许可证含附加条款，不能沿用历史版本许可印象 |
| [Marker](https://github.com/datalab-to/marker) | 文档转 Markdown、JSON、HTML 等，支持 OCR 和公式等元素 | 作为质量对照与解析备选 | 当前代码和模型权重分别许可 |
| [olmOCR](https://github.com/allenai/olmocr) | PDF 与图像文档转 Markdown；提供专门评测集 | 阅读顺序、长文档识别与扫描件基线 | 为文本解析设计，不能直接替代图重建 |
| [Adobe Acrobat](https://helpx.adobe.com/acrobat/desktop/create-documents/scan-documents-to-pdfs/edit-scans.html) | 扫描 PDF OCR、文本编辑与增强工作流 | 商业交互与保留版面基准 | 采购的是应用能力；不自动得到可嵌入自研产品的引擎 |
| [ABBYY FineReader](https://pdf.abbyy.com/learning-center/pdf-conversion/) | OCR、文档结构识别与 Office 格式转换 | 复杂正文与版面保留的商业基准 | 应分别试验保真模式与便于修改的模式 |
| [Mathpix](https://docs.mathpix.com/reference/supported-formats) | STEM 文档识别，支持 MMD 及多种转换格式、行级 JSON | 公式密集文档的 API 对照与可选服务 | 文字和公式识别不是任意插图原生图结构恢复 |
| [Stirling PDF](https://github.com/Stirling-Tools/Stirling-PDF) | 自托管 PDF 工作台，组合页面、OCR 等处理能力 | PDF 工具交互与任务组合参考 | 当前仓库根许可列有子目录例外，应按实际复用的组件判断 |

OCRmyPDF 官方 cookbook 区分了方向旋转与小角度纠偏，也区分清理 OCR 输入与改变最终页面。可迁移的思路是保留原始证据、显式记录变换，并区分识别输入与最终产物。[OCRmyPDF cookbook](https://ocrmypdf.readthedocs.io/en/stable/cookbook.html)。

### 7.3 对绘图系统的参考价值

借鉴坐标映射、区域分解、证据保留、识别置信度和迭代纠错的方法。需要重建的是科研图中的文字、图元、模块与连接关系。页面管理、搜索型 PDF、PDF/A 和整篇文档重排不属于 FastFigure 的建设内容。

## 8 素材库与科研组件

| 来源 | 已核验的使用特征 | 接入建议 |
| --- | --- | --- |
| [Bioicons](https://bioicons.com/extensions/) | 可接 draw.io 和 Inkscape；不同素材使用不同许可证 | 按单个素材保存作者、许可证、来源与引用文本 |
| [SciDraw](https://scidraw.io/search) | 科研插图仓库，包含不同格式与 Creative Commons 许可素材 | 只将有明确元数据的素材纳入组件库 |
| [Servier Medical Art](https://smart.servier.com/) | 官方列明 CC BY 4.0 | 可作为医学素材来源，保留归属信息 |
| [SciSVG](https://github.com/SaveenaSolanki/SciSVG) | 有命名层与元数据的科学 SVG；资产与软件分别许可 | 参考“可搜索、可编辑、可引用”的素材包结构 |

科研组件库比通用图标库多一层含义。例如模型中的 encoder、token 序列、矩阵与 tensor，以及生物图中的细胞膜、受体与通路箭头，应具有可修改参数和布局规则。第一阶段可先建设计算机科学方法图组件；生物医学素材作为可插入模块逐步扩展，不要求所有细胞插图都拆成可编辑的微观路径。

## 9 底层技术选型

| 层 | 重点候选 | 采用判断 |
| --- | --- | --- |
| 图编辑入口 | [draw.io embed](https://www.drawio.com/docs/reference/embed-mode/)、SVGEdit | 先复用成熟编辑能力，验证导入与导出；保留 FastFigure 自己的对象模型 |
| 自有画布 | [Fabric.js](https://github.com/fabricjs/fabric.js)、[Konva](https://github.com/konvajs/konva) | 适合搭交互层；科学对象、连接关系和格式转换需另写 |
| 节点编辑 | [React Flow](https://reactflow.dev/learn) | 可用于结构侧栏与流程图交互；复杂论文图的自由排版要另评估 |
| 图布局 | [ELK.js](https://github.com/kieler/elkjs)、Graphviz | 做端口和层级布局候选；重建时只在用户允许的区域重排 |
| PPTX 生成 | [PptxGenJS](https://gitbrent.github.io/PptxGenJS/)、[python pptx](https://python-pptx.readthedocs.io/en/latest/) | 能写文字、形状和图表；端点绑定、复杂分组和路径要做专项验证与补充 |
| PDF 读取 | [PDF.js](https://github.com/mozilla/pdf.js)、[pypdfium2](https://github.com/pypdfium2-team/pypdfium2)、[PyMuPDF](https://pymupdf.readthedocs.io/en/latest/page.html) | 前端预览和服务端解析分别选择；PyMuPDF 的向量提取方便，需考虑其具体许可 |
| SVG 渲染 | [resvg](https://github.com/linebender/resvg) 与浏览器渲染 | 做固定字体下的预览与视觉回归候选 |

不要先购买或重写一个通用无限画布，再寻找论文需求。真正需要自研的部分，是图内对象与关系恢复、语义对象模型、科研样式约束、稳定局部修改、多格式编译和评测。

## 10 影响采用决定的当前许可证信息

这里只记录与选型直接有关的项目状态，具体采用版本应以其文件为准。软件代码、模型权重、素材与训练数据分别登记。

| 项目 | 当前核验信息 | 采用影响 |
| --- | --- | --- |
| generic pixel svg rebuild | [GPL-3.0](https://github.com/neverclover/generic-pixel-svg-rebuild/blob/main/LICENSE) | 借鉴验收思路；直接复用应另明确产品分发安排 |
| ssmisya drawio figure skill | [MIT](https://github.com/ssmisya/drawio-figure-skill/blob/main/LICENSE) | 可作为原生输出工作流参考 |
| Lancelot img2pptx | [Apache-2.0](https://github.com/Lancelot-Xie/img2pptx/blob/main/LICENSE) | 可参考组件清单与审计方法 |
| AutoFigure Edit | [MIT](https://github.com/ResearAI/AutoFigure-Edit/blob/main/LICENSE)；模型依赖另计 | 可拆解结构化重建流程 |
| BRCOO image2pptx、LiveFigure | 所查树未发现独立 LICENSE 文件 | 可研究方法，暂不纳入可直接复制代码的名单 |
| MinerU | [Apache-2.0 加附加条款](https://github.com/opendatalab/MinerU/blob/master/LICENSE.md)，包括在线服务标识义务与商业门槛 | 版本锁定后再决定集成方式，不能标成无附加条件 Apache-2.0 |
| Marker | [README](https://github.com/datalab-to/marker) 区分 Apache-2.0 代码与带条件的模型权重许可 | 模型服务和代码复用分别估算 |
| PyMuPDF | [AGPL 与商业许可](https://pymupdf.readthedocs.io/en/latest/about.html) | 对比 PDFium 等替代实现与商业选项 |
| OCRmyPDF 与依赖 | [官方介绍](https://ocrmypdf.readthedocs.io/en/stable/introduction.html) 提醒核对依赖许可，并列出 Ghostscript 的 AGPLv3 许可 | 将主包与所选 OCR、PDF/A、图像处理依赖一起登记 |
| Stirling PDF | [根许可](https://github.com/Stirling-Tools/Stirling-PDF/blob/main/LICENSE) 对多个目录作例外说明 | 按子模块核对，不用单一仓库标签作结论 |
| Bioicons、SciSVG、OmniSVG 数据 | 资产、软件、数据可能采用不同许可 | 来源元数据进入对象与素材记录 |

## 11 建议优先验证的组合

第一组是方法图重建：图件源结构读取、带坐标 OCR、视觉模型补充对象语义、统一 FigureIR、draw.io 编辑、PPTX 原生对象导出。PDF 提取工具仅用于外部素材准备参考。

第二组是数据图：原始 CSV 或现有 Matplotlib、ggplot2、Plotly 定义，加统一风格和面板装配；截图数字化作为独立任务，保留提取值与原始值的区别。

第三组是容器与样式：同一图结构切换规范、标题带、虚线和手绘皮肤，检查文字、端口与连接关系不变。扫描件和 PDF 系统仅保留为解析与迭代方法的参考。

下一步最有价值的工作，是对同一批论文方法图运行这些路线，并让研究者完成改标签、移动模块、接新分支和统一风格等真实编辑任务。对应样本、指标、门槛与研发阶段已列在 [实施方案](2026-10-28-fastfigure-proposal.md)。
