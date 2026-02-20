# SDU_Archive

山东大学校史互动档案库（RAG + 题库），面向 2~4GB 内存主机的低资源、一键容器化方案。

## 功能介绍
- **鉴权与风控**：JWT 登录/注册，区分普通用户与超级管理员；Nginx `limit_req` + 后端漏桶限流，避免高频滥用。
- **档案上传与管理**：支持文本/图片（<=100MB），入库即自动分块与向量化；超管可按 Chunk 精修或删除，修正知识切片。
- **史实问答（RAG）**：向量 + 文本检索，返回引用片段与来源；未命中直接回复“暂无记载”，降低幻觉。
- **互动题库与积分**：题目 CRUD（管理员）、用户答题得分并累计积分；防重复作答。
- **前端体验**：红色主题、移动端友好，涵盖登录/问答/上传/答题/后台修订入口。

## 技术栈与实现简述
- 前端：Vite + React + TypeScript，Nginx 托管静态资源并反代 `/api`，移动优先自适应布局。
- 网关：Nginx（容器），对 API 入口做限流与路由分发。
- 后端：FastAPI + SQLAlchemy，JWT 鉴权，内存级漏桶限流；Background 处理由 FastAPI 本身负责（未引入重型队列）。
- 数据库：PostgreSQL + `pgvector` 扩展，用于结构化数据与向量检索。
- 存储：MinIO 用于文件对象；元数据与切片存 Postgres。
- 嵌入：优先调用外部 API（如 OpenAI）；若未配置 API Key，则使用确定性轻量哈希向量保证链路可用（非语义，只为示例）。

## 部署指南
1) 准备 Docker 与 docker-compose。
2) 可选：在环境中导出 `OPENAI_API_KEY`（有语义嵌入需求时）。
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

> 说明：公开检索页面需要先登录后才能发起查询请求。

### 环境变量（可在 docker-compose 或 `.env` 中配置）
- `OPENAI_API_KEY`（可选）：存在则使用真实嵌入。
- `DATABASE_URL`：Postgres 连接串，默认 `postgresql+psycopg2://sdu:sdu@db:5432/sdu_archive`。
- `MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY/MINIO_BUCKET`：对象存储配置，默认内置 MinIO。
- `SECRET_KEY`：JWT 签名密钥。
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`：启动时自动创建的超级管理员。
- `RATE_LIMIT_PER_MINUTE`：后端漏桶限流阈值，默认 60。

## 操作指南
1) **登录/注册**：前端首页点击“登录/注册”，输入邮箱与密码；默认管理员账号 `admin@example.com / admin123`（请务必修改）。
2) **史实问答**：登录后在“史实问答”区域输入问题，返回回答与引用来源；无命中则提示“暂无记载”。
3) **上传档案**：在“档案上传”选择文本或图片文件（<=100MB），填写标题/描述，提交后将自动切片入库并生成向量。
4) **互动题库**：在“互动题库”选择题目并作答，系统判分并累计积分；同一题目不可重复作答。
5) **管理员入口**：
   - 创建题目：输入题干、选项、正确序号与分值后提交。
   - 切片修订：支持按关键词搜索、分页加载、编辑并重嵌入，也可直接删除错误切片。
   - 题库管理：支持题目创建、关键词检索与删除。

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
- **文件类型受限**：仅允许文本与图片（安全与需求所限）；音视频未纳入当前范围。
- **端口冲突**：可通过环境变量覆盖宿主机映射端口：
   `FRONTEND_HOST_PORT`、`API_HOST_PORT`、`POSTGRES_HOST_PORT`、`MINIO_API_PORT`、`MINIO_CONSOLE_PORT`。
