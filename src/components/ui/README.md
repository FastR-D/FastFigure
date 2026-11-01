# FastFigure UI 基础组件

初始实现直接复制自 `/home/gugumur/FastPPT/packages/components/src`，在当前应用中维护，不建立 workspace 或 monorepo 包依赖。

保留基础布局、按钮、输入、下拉、模态框、焦点管理、图标、颜色令牌及主题能力。FastFigure 调整品牌资源与存储键，并将复制组件的模板元素也改为使用组件原语。业务界面统一从本目录导入，不在业务模板中直接写 HTML。SVG 绘图由 `components/figure` 与 `core/svg.ts` 负责。

`styles.css` 管控基础控件；应用 CSS 仅负责布局和业务组件样式。ESLint 的 `fastfigure/component-only-template` 会检查 Vue 模板。
