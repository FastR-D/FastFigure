# FastFigure 品牌与业务 UI

通用原语、按钮、输入、原生 Select 和 Modal 直接从 `@fastrd/ui-vue` 导入，颜色模式由 `@fastrd/ui-foundation` 初始化，保留 `fastfigure.color-mode` 存储键。

本目录只维护品牌素材、绘图应用 Icon、IconButton 组合及接入业务通知的 ErrorMessage。`src/styles/app.css` 将宿主布局变量映射到 FastUI token，`workspace.css` 保留业务布局；不在这里复制公共控件或颜色表。SVG 绘图、图像和导出由 `components/figure` 与 `core` 负责。
