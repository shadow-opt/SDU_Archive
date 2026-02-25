# SDU Archive Frontend

前端基于 React + TypeScript + Vite，提供公开问答页、互动题库与管理员入口。

## 本地开发

```bash
npm install
npm run dev
```

## 构建与检查

```bash
npm run lint
npm run build
```

## 问答页（Home）当前能力

- 支持登录后的多轮消息流展示（当前会话内）。
- 使用 SSE 对接 `/api/rag/stream`，实时增量渲染 AI 输出。
- 支持 AI 输出基础 Markdown（标题、列表、引用、链接、代码）。
- 对每轮 AI 回答展示对应引用文献片段。

## 主要依赖

- `react-markdown` + `remark-gfm`：Markdown 渲染。
- `@tailwindcss/typography`：Markdown 排版样式。
