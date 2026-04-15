# 样式隔离修复说明

## 问题

启用插件后，Tailwind CSS的全局样式（特别是 `@tailwind base`）会重置宿主页面的所有HTML元素样式，导致页面显示异常。

## 解决方案

实施了以下三个关键修复：

### 1. 禁用Tailwind Preflight

在 `tailwind.config.js` 中禁用了preflight（基础样式重置）：

```javascript
corePlugins: {
  preflight: false,
}
```

这防止了Tailwind的全局样式重置影响宿主页面。

### 2. 增加样式优先级

使用 `important` 选项确保我们的样式只影响扩展组件：

```javascript
important: '#chatdown-root',
```

所有Tailwind类都会自动添加 `#chatdown-root` 前缀，提高特异性。

### 3. 隔离的基础样式

在 `src/content/index.css` 中，只为 `#chatdown-root` 及其子元素添加必要的基础样式：

```css
#chatdown-root {
  all: initial;  /* 重置所有继承的样式 */
  display: block;
  font-family: system-ui, ...;
  /* 其他基础样式 */
}

#chatdown-root * {
  box-sizing: border-box;
  /* 只影响扩展内部的元素 */
}
```

### 4. 容器隔离

在 `src/content/index.tsx` 中，为容器添加内联样式：

```javascript
container.style.cssText = 'all: initial; display: block;';
```

## 测试步骤

1. 重新加载扩展：
   - 打开 `chrome://extensions/`
   - 点击扩展的刷新按钮

2. 访问测试页面：
   - ChatGPT: https://chat.openai.com
   - Gemini: https://gemini.google.com
   - DeepSeek: https://chat.deepseek.com
   - 豆包: https://www.doubao.com

3. 验证：
   - 页面原有样式应该保持不变
   - "Generate Article" 按钮正常显示
   - Modal弹窗样式正常
   - 没有样式冲突

## 技术细节

### 为什么不使用Shadow DOM？

虽然Shadow DOM可以完全隔离样式，但会导致以下问题：
- Modal的 `position: fixed` 相对于Shadow DOM定位，而不是viewport
- 无法使用 `document.body` 作为Portal容器
- 增加了实现复杂度

### 当前方案的优势

- ✅ 完全隔离样式，不影响宿主页面
- ✅ Modal和fixed元素正常工作
- ✅ 保持代码简洁
- ✅ 兼容性好

## 如果仍有样式冲突

如果发现特定页面仍有样式冲突，可以：

1. 检查浏览器控制台的CSS警告
2. 使用开发者工具检查冲突的样式规则
3. 在 `src/content/index.css` 中添加更具体的重置规则
4. 考虑为特定元素添加 `!important` 标记

## 相关文件

- `tailwind.config.js` - Tailwind配置
- `src/content/index.css` - 内容脚本样式
- `src/content/index.tsx` - 内容脚本入口
