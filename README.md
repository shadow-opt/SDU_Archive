# SDU_Archive

山东大学校史互动档案库（RAG + 题库），面向 2~4GB 内存主机的低资源、一键容器化方案。

## 功能介绍
- **鉴权与风控**：JWT 登录/注册，区分普通用户与超级管理员；Nginx 反代 + 后端漏桶限流，避免高频滥用。
- **档案上传与管理**（管理员）：支持文本/图片/PDF（≤100MB），入库即自动分块与向量化；支持文档列表查看与删除，切片精修或删除。
- **史实问答（RAG）**：向量检索 + SSE 流式输出，返回引用片段与来源；未命中直接回复"暂无记载"，降低幻觉。
- **互动题库与积分**：题目 CRUD（管理员）、CSV 批量导入；用户答题得分并累计积分，防重复作答，已答题目自动标记。
- **管理后台 CMS**：数据仪表盘（KPI 卡片、高频错题 Top5、积分榜 Top10）、用户管理（角色/状态/密码重置）、切片管理、题库管理。
- **前端体验**：红色主题、移动端友好，涵盖登录/问答/答题/后台管理入口，404 兜底页面。

## 技术栈与实现简述
- 前端：Vite + React 19 + TypeScript，Tailwind CSS 主题化，Nginx 托管静态资源并反代 `/api`。
- 网关：Nginx（容器），对 API 入口做路由分发，SSE 流式传输优化（禁用缓冲）。
- 后端：FastAPI + SQLAlchemy 2.0 + Pydantic v2，JWT 鉴权，内存级漏桶限流。
- 数据库：PostgreSQL 16 + `pgvector` 扩展，用于结构化数据与向量检索（HNSW 索引）。
- 存储：MinIO 用于文件对象；元数据与切片存 Postgres。
- AI：优先调用 OpenAI API（text-embedding-3-small 嵌入 + gpt-4o-mini 生成）；若未配置 API Key，则使用确定性哈希向量保证链路可用（非语义，仅演示）。

## 部署指南
1) 准备 Docker 与 docker-compose。
2) 可选：在环境中导出 `OPENAI_API_KEY`（有语义嵌入与AI问答需求时）。
3) 启动：
```bash
docker compose up --build
```
4) 访问：
- 前端（Nginx 静态 + 反代）：`http://localhost:18080`（可用 `FRONTEND_HOST_PORT` 覆盖）
- 后端 API（直接）：`http://localhost:18000`（可用 `API_HOST_PORT` 覆盖）
- Postgres（宿主机映射）：`localhost:15433`（可用 `POSTGRES_HOST_PORT` 覆盖）
- MinIO API（宿主机映射）：`http://localhost:19002`（可用 `MINIO_API_PORT` 覆盖）
- MinIO Console（宿主机映射）：`http://localhost:19003`（可用 `MINIO_CONSOLE_PORT` 覆盖）

### 默认管理员账号
**邮箱**: `admin@example.com`
**密码**: `admin12345678`

> ⚠️ **重要安全提示**：首次部署后请立即修改默认管理员密码！可通过环境变量 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 自定义。建议使用 `openssl rand -hex 32` 生成强密码。

> 说明：公开检索页面需要先登录后才能发起查询请求。档案上传功能仅对管理员开放。

### 环境变量（可在 docker-compose 或 `.env` 中配置）
- `OPENAI_API_KEY`（可选）：用于语义嵌入和AI回答生成。未配置时使用哈希向量（仅演示）。
- `OPENAI_MODEL`（可选）：LLM模型选择，默认 `gpt-4o-mini`（推荐），可选 `gpt-4o`、`gpt-3.5-turbo`。
- `DATABASE_URL`：Postgres 连接串，默认 `postgresql+psycopg2://sdu:sdu@db:5432/sdu_archive`。
- `MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY/MINIO_BUCKET`：对象存储配置，默认内置 MinIO。
- `SECRET_KEY`：JWT 签名密钥（**生产环境必须修改**，建议 `openssl rand -hex 32` 生成）。
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`：启动时自动创建的超级管理员（**生产环境请务必修改默认密码**）。
- `RATE_LIMIT_PER_MINUTE`：后端漏桶限流阈值，默认 60。
- `CORS_ORIGINS`：允许的跨域来源，默认 `http://localhost:18080,http://localhost:3000`。

> 💡 **完整配置指南**：参见 [DEPLOYMENT.md](DEPLOYMENT.md)

## 操作指南

### 普通用户
1) **登录/注册**：前端首页输入邮箱与密码。
2) **史实问答（AI RAG）**：登录后在搜索框输入问题，AI 将基于档案内容流式生成回答并提供引用来源；无命中则提示"暂无记载"。
3) **互动题库**：在"互动题库"页选择未答题目并作答，系统判分并累计积分；已答题目自动灰显标记，全部答完展示完成页面。

### 管理员
1) **管理员登录**：通过 `/admin/login` 入口登录管理员账号。
2) **数据仪表盘**：总览用户数、答题数、正确率、今日积分，查看高频错题和积分排行。
3) **档案上传**：上传文本/图片/PDF 文件（≤100MB），填写标题/描述/时期/类型后提交，自动切片入库并生成向量。支持查看已上传文档列表和删除文档（级联删除切片）。
4) **切片管理**：按关键词搜索、分页加载，编辑切片内容（自动重嵌入），或删除错误切片。
5) **题库管理**：创建/编辑/删除题目，CSV 批量导入（模板可下载），按关键词检索。
6) **用户管理**：查看用户列表，按邮箱/角色/状态筛选，变更角色、启停账号、重置密码。

### 前端本地开发
```bash
cd frontend
npm install
npm run dev    # 启动 Vite dev server，默认 http://localhost:5173
```

## 最小自检流程（推荐每次改动后执行）
启动容器后执行：

```bash
./scripts/smoke.sh
```

脚本会自动检查：
- API 健康接口可用
- 前端首页可访问
- 未登录 RAG 请求返回 `401`
- 管理员登录成功且角色为 `admin`
- 管理员可访问受保护接口 `/api/chunks`（含关键词查询）
- 管理员可完成题目创建并删除（最小写操作回归）

## 开发与目录
- `backend/`：FastAPI 服务代码、依赖（`backend/requirements.txt`）、容器构建（`backend/Dockerfile`）。
- `frontend/`：Vite React 前端、样式与 Nginx 配置。
- `docker-compose.yml`：统一编排 Postgres+pgvector、MinIO、API、前端网关。

## 常见问题
- **`python:3.11-slim ... EOF` 拉取失败**：这是镜像仓库网络问题，不是代码错误。建议按顺序执行：
   1. `docker pull python:3.11-slim`
   2. `docker compose build api`
   3. `docker compose up`
   如仍失败，重试或配置 Docker 镜像代理。
- **无法联网时的嵌入**：未提供外部 API Key 时使用哈希向量，检索仅作演示，请在生产环境配置真实嵌入服务。
- **文件类型受限**：仅允许文本/图片/PDF（安全与需求所限）；音视频未纳入当前范围。
- **端口冲突**：可通过环境变量覆盖宿主机映射端口：
   `FRONTEND_HOST_PORT`、`API_HOST_PORT`、`POSTGRES_HOST_PORT`、`MINIO_API_PORT`、`MINIO_CONSOLE_PORT`。
- **SSE 流式回答延迟**：Nginx 已配置 `proxy_buffering off`；若使用其他反代，请确认关闭 SSE 缓冲。
