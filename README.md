# SDU_Archive

山东大学校史互动档案库（RAG + 题库），面向低内存环境的一键容器化方案。

## 功能概览
- 用户/管理员鉴权（JWT），网关+后端双层限流
- 文档上传（文本/图片，100MB 内），自动切片入向量库，管理员可修正/删除切片
- 史实问答：RAG 检索返回引用，未命中即答“暂无记载”
- 互动题库：题目管理、答题积分
- 红色主题前端，移动端友好

## 快速启动
```bash
docker-compose up --build
```
访问前端：`http://localhost:8080`，后端：`http://localhost:8000`

默认管理账号：`admin@example.com / admin123`（可通过环境变量 `ADMIN_EMAIL/ADMIN_PASSWORD` 修改）。

## 环境变量要点
- `OPENAI_API_KEY` 可选，存在时用于真实嵌入；否则使用轻量确定性嵌入保持链路可用
- `DATABASE_URL`：Postgres+pgvector 连接串
- `MINIO_*`：对象存储配置，默认使用内置 MinIO

## 目录结构
- `backend/` FastAPI 服务
- `frontend/` Vite + React 前端与 Nginx 网关
- `docker-compose.yml` 一键拉起 API、Postgres+pgvector、MinIO、前端网关
