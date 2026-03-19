# Notion 导出格式问题排查指南

## 问题描述
导出到 Notion 后，Markdown 格式（加粗、表格等）没有正确渲染。

## 已实现的修复

### 1. 重写了 `parseInlineFormatting` 函数
- 使用顺序解析而不是正则表达式
- 避免嵌套匹配冲突
- 支持的格式：
  - `**text**` → 加粗
  - `*text*` → 斜体
  - `` `code` `` → 代码
  - `[text](url)` → 链接

### 2. 添加了调试日志
在浏览器控制台（F12）中可以看到：
- 导出开始信息
- 生成的 blocks 数量
- 前 3 个 blocks 的详细内容
- Notion API 响应

## 测试步骤

### 1. 重新加载扩展
```
1. 打开 chrome://extensions/
2. 找到 Chatdown 扩展
3. 点击刷新按钮
```

### 2. 生成测试文章
使用 `NOTION_FORMAT_TEST.md` 中的内容作为测试用例，或者在 AI 对话中包含：
- 加粗文字：**这是加粗**
- 斜体文字：*这是斜体*
- 代码：`console.log()`
- 链接：[Google](https://google.com)
- 表格

### 3. 导出到 Notion
1. 生成文章后，点击导出按钮（📤）
2. 选择 "Export to Notion"
3. 打开浏览器控制台（F12）查看日志

### 4. 检查 Notion 页面
在 Notion 中检查：
- ✅ 加粗文字是否显示为粗体
- ✅ 斜体文字是否显示为斜体
- ✅ 代码是否显示为等宽字体
- ✅ 链接是否可点击
- ✅ 表格是否正确显示

## 调试信息

### 查看控制台日志
打开浏览器控制台（F12），导出时会看到：

```
Starting Notion export...
Content length: 1234
Generated blocks: 15
First 3 blocks: [
  {
    "object": "block",
    "type": "heading_1",
    "heading_1": {
      "rich_text": [
        {
          "type": "text",
          "text": { "content": "标题" }
        }
      ]
    }
  },
  ...
]
Notion page created: https://notion.so/...
```

### 检查 rich_text 格式
正确的加粗格式应该是：
```json
{
  "type": "text",
  "text": { "content": "加粗文字" },
  "annotations": { "bold": true }
}
```

## 可能的问题

### 1. 如果格式仍然不正确
- 检查控制台日志中的 `rich_text` 是否包含 `annotations`
- 确认 Markdown 语法正确（`**text**` 而不是 `** text **`）

### 2. 如果表格显示不正确
- Notion API 不直接支持表格块
- 表格会转换为段落格式（表��加粗）
- 这是预期行为

### 3. 如果出现 API 错误
- 检查 Integration Token 是否正确
- 确认 Database 已分享给 Integration
- 查看控制台中的详细错误信息

## 下一步

如果问题仍然存在，请：
1. 提供控制台日志截图
2. 提供 Notion 页面截图
3. 提供原始 Markdown 内容示例
