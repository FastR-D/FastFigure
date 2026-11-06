# 手绘主题

左侧“样式 → 手绘主题”提供四个入口，作用于当前容器。应用为一次可撤销操作，设置配色、笔触、起伏强度、容器填充和初始字体；原有字号、粗斜体、手工颜色与科学内容保持。随后可用中心画板的字体栏自由改字，不会持续强制覆盖用户设置。新文字继承当前容器默认字体；新图表编辑器也读取这个默认值。内部容器的局部样式仍可覆盖。

| 主题 | 初始字体 | 绘制方式 |
| --- | --- | --- |
| Comic Sans MS | 系统 Comic Sans MS → 内置 Comic Neue → MiSans | 自研柔和单线轮廓，轻微手绘起伏，柔和彩色 |
| XKCD | 内置 Patrick Hand → MiSans | Rough.js 单线手稿，黑白底色 |
| Excalidraw | 内置 Excalifont → MiSans | Rough.js 双线草绘，淡彩白板 |
| draw.io Sketch | 系统 Comic Sans MS → 内置 Comic Neue → MiSans | Rough.js 粗糙轮廓，图形内部排线，容器默认纯色底 |

图表和带定位矩阵的既有字形保留原字体，避免全局换字体破坏数值布局；可在图表编辑器重新排版。图表数据标记、坐标轴、重建来源图元保持原几何。普通矩形、椭圆、菱形、特征体、结构内部图示及语义连接支持手绘；显式 `handDrawn=false` 保留精确线条。路由失败的连接继续显示诊断。

## Comic 曲线

`src/core/comicStroke.ts` 是独立算法。解析轮廓的直线 / 二次 / 三次曲线，以固定种子生成间隔和幅度不等的波峰、波谷，混入缓慢弯曲，沿法线偏移后用三次曲线平滑连接。波形约每 64 个画布单位换向，避免密集小抖动；默认强度为 0.45，最大法向偏移约 0.9 个单位，小形状按边长和短边进一步限幅。闭合轮廓只增加小幅错切，让角点保持端正，保持中心与闭合；开放路径的端点、路由折点保持，以便连接箭头。曲线连接处保持原切线，椭圆和圆角不会产生尖角。结果是单条墨线，不叠加直边或第二笔轮廓。平移不会重新抽样；种子和尺寸相同则可复现，强度为零恢复原轮廓。Comic 默认边框不调用 Rough.js；用户另选斜线填充时仅底纹复用它。

参数为 `style.sketchStyle`（comic/xkcd/excalidraw/drawio）、`style.roughness`、`style.fontFamily`，容器 `appearance` 可覆盖。编辑“我的风格”可调整笔触与起伏强度。组件捕获、缩放、保留外观插入、工程 JSON 与原生 SVG 元数据保留参数。助手上下文公布内置主题；风格 / 方案快照校验已指定笔触与强度。

SVG 保留实际曲线和可编辑文字，不内嵌字体二进制。外部打开 SVG 需要安装字体或接受对应回退，当前未验证所有第三方编辑器往返。

## 字体与参考

Comic Sans MS 不随应用分发。Comic Neue、Patrick Hand 和 Excalifont 已本地提供，无需运行时访问第三方字体服务。原始许可和转换说明见 [字体通知](../../public/notices/fonts.md)。XKCD 主题采用 Patrick Hand；带非商业限制的 xkcd Script 未打包。

- [Excalidraw 官方字体说明](https://plus.excalidraw.com/excalifont)：Excalifont 和 OFL-1.1 许可。
- [draw.io Rough Sketch 文档](https://www.drawio.com/docs/manual/styles/rough-style/)：Rough.js、粗糙度、多笔触和填充选项。
- [Matplotlib XKCD 模式](https://matplotlib.org/stable/api/_as_gen/matplotlib.pyplot.xkcd.html)：手稿模式的参考；本实现不调用 Matplotlib。
- [Comic Neue](https://github.com/google/fonts/tree/main/ofl/comicneue)、[Patrick Hand](https://github.com/google/fonts/tree/main/ofl/patrickhand) 与 [xkcd-font 许可](https://github.com/ipython/xkcd-font/)。

验收复用既有核心文件和 1920×1080 编辑主流程：明显双向起伏、闭合偏斜、开放端点固定、小形状限幅、多段路径、平移复现、三类基础形状的单条轮廓、四主题的字体与素材 / SVG 往返、助手风格快照、实际加载字体、独立修改字体和撤销。截图位于 `test-results/ui/theme-{comic,xkcd,excalidraw,drawio}.png`。没有新增维护脚本或 UI 流程。
