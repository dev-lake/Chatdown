# Side Panel 实现说明

## 改动概述

已将 Chatdown 从页面内嵌侧边栏改为使用 Chrome 原生 Side Panel API，类似浏览器书签栏的体验。

## 主要变更

### 1. 新增文件
- `src/sidepanel/index.html` - 侧边栏 HTML 入口
- `src/sidepanel/index.tsx` - 侧边栏 React 入口
- `src/sidepanel/index.css` - 侧边栏样式
- `src/sidepanel/App.tsx` - 侧边栏主组件

### 2. 修改文件
- `public/manifest.json` - 添加 `sidePanel` 权限和配置
- `src/background/index.ts` - 添加打开侧边栏和消息转发逻辑
- `src/content/App.tsx` - 简化为单个触发按钮
- `src/types/index.ts` - 添加新的消息类型

### 3. 删除文件
- `src/content/components/ToggleButton.tsx` - 不再需要
- `src/content/components/Sidebar.tsx` - 不再需要

## 工作流程

1. 用户点击页面右侧的 📝 按钮
2. Content script 发送 `openSidePanel` 消息到 background
3. Background script:
   - 调用 `chrome.sidePanel.open()` 打开原生侧边栏
   - 发送 `generatingArticle` 消息到侧边栏显示加载状态
   - 解析对话并调用 LLM API 生成文章
   - 发送 `displayArticle` 消息到侧边栏显示文章
4. 侧边栏接收消息并更新 UI

## 优势

✅ **原生体验**: 使用浏览器原生侧边栏，不会与页面内容冲突
✅ **更好的隔离**: 完全独立的上下文，无需担心样式污染
✅ **熟悉的 UX**: 用户已经熟悉书签栏等侧边栏的使用方式
✅ **跨标签页**: 侧边栏可以在不同标签页间保持状态
✅ **简化代码**: 不需要处理 z-index、backdrop、动画等复杂逻辑

## 测试步骤

1. 构建扩展: `npm run build`
2. 在 Chrome 中加载 `dist/` 目录
3. 访问支持的 AI 聊天平台（ChatGPT、Gemini、DeepSeek、豆包）
4. 点击页面右侧的 📝 按钮
5. 观察浏览器右侧打开原生侧边栏
6. 等待文章生成完成
7. 测试切换 Preview/Markdown 标签
8. 测试 Copy 和 Download 功能

## 注意事项

- Side Panel API 需要 Chrome 114+ 版本
- 侧边栏是浏览器级别的，不是页面级别的
- 可以通过浏览器右上角的侧边栏图标手动关闭/打开
