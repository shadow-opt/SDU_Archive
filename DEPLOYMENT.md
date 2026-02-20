# SDU Archive 部署与配置完整指南

## 目录
- [系统要求](#系统要求)
- [快速开始](#快速开始)
- [详细部署步骤](#详细部署步骤)
- [环境变量配置](#环境变量配置)
- [生产环境部署](#生产环境部署)
- [故障排查](#故障排查)
- [性能优化](#性能优化)
- [备份与恢复](#备份与恢复)

## 系统要求

### 硬件要求
- **最小配置**：2GB RAM，10GB 磁盘空间
- **推荐配置**：4GB RAM，20GB 磁盘空间
- **CPU**：2核心或以上

### 软件要求
- Docker 20.10+
- Docker Compose 2.0+
- （可选）域名和SSL证书（生产环境）

### 支持的操作系统
- Linux (Ubuntu 20.04+, CentOS 8+, Debian 11+)
- macOS 11+
- Windows 10/11 (WSL2)

## 快速开始

### 1. 克隆仓库
```bash
git clone https://github.com/shadow-opt/SDU_Archive.git
cd SDU_Archive
```

### 2. 配置环境变量（可选）
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件（至少配置 OPENAI_API_KEY）
nano .env
```

**最小必要配置**：
```env
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 3. 启动服务
```bash
docker compose up --build
```

### 4. 访问应用
- **前端界面**: http://localhost:18080
- **默认管理员账号**:
  - 邮箱: `admin@example.com`
  - 密码: `admin123`

⚠️ **首次登录后立即修改密码！**

## 详细部署步骤

### Step 1: 环境准备

#### 安装 Docker (Ubuntu)
```bash
# 更新包索引
sudo apt-get update

# 安装依赖
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# 添加 Docker 官方 GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 设置仓库
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 验证安装
docker --version
docker compose version
```

#### 配置 Docker 权限（可选）
```bash
# 添加当前用户到 docker 组
sudo usermod -aG docker $USER

# 重新登录或执行
newgrp docker
```

### Step 2: 获取 OpenAI API Key

1. 访问 https://platform.openai.com/api-keys
2. 登录或注册账号
3. 创建新的 API key
4. 保存 key（格式：`sk-...`）

**成本预估**（使用 gpt-4o-mini 示例）：
- 每次查询：约 $0.0001-0.0003
- 1000次查询：约 $0.10-0.30
- 月活100用户，平均每天10次查询：约 $3-9/月

### Step 3: 配置应用

#### 创建 .env 文件
```bash
cp .env.example .env
```

#### 编辑 .env 配置
```env
# ========== OpenAI 配置 ==========
# 必需：用于AI问答和语义搜索
OPENAI_API_KEY=sk-your-api-key-here

# 可选：LLM模型选择（默认 gpt-4o，更可靠）
# 选项: gpt-4o（质量优先，默认）, gpt-4o-mini（性价比高）, gpt-3.5-turbo（最便宜但已过时）
OPENAI_MODEL=gpt-4o

# 可选：兼容 OpenAI 协议的第三方/自托管地址
OPENAI_BASE_URL=

# ========== 安全配置 ==========
# 必须修改：JWT签名密钥（生成随机字符串）
SECRET_KEY=$(openssl rand -hex 32)

# 必须修改：管理员账号
ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=your-secure-password-here

# ========== 数据库配置 ==========
# 使用默认值即可（Docker内部网络）
DATABASE_URL=postgresql+psycopg2://sdu:sdu@db:5432/sdu_archive

# ========== 对象存储配置 ==========
# 使用默认值即可（Docker内部MinIO）
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=false
MINIO_BUCKET=documents

# ========== 应用配置 ==========
# 限流配置（每分钟请求次数）
RATE_LIMIT_PER_MINUTE=60

# CORS配置（允许的前端域名，逗号分隔）
CORS_ORIGINS=http://localhost:18080,http://localhost:3000

# ========== 端口配置（可选） ==========
# 前端端口（默认18080）
FRONTEND_HOST_PORT=18080

# API端口（默认18000）
API_HOST_PORT=18000

# 数据库端口（默认15433）
POSTGRES_HOST_PORT=15433

# MinIO API端口（默认19002）
MINIO_API_PORT=19002

# MinIO控制台端口（默认19003）
MINIO_CONSOLE_PORT=19003
```

### Step 4: 启动服务

#### 开发环境启动（前台运行，可查看日志）
```bash
docker compose up --build
```

#### 生产环境启动（后台运行）
```bash
docker compose up -d --build
```

#### 查看日志
```bash
# 查看所有服务日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f api
docker compose logs -f frontend
docker compose logs -f db
```

#### 停止服务
```bash
# 停止但保留容器
docker compose stop

# 停止并删除容器（保留数据卷）
docker compose down

# 停止并删除所有（包括数据）
docker compose down -v
```

### Step 5: 验证部署

#### 健康检查
```bash
# 检查API健康状态
curl http://localhost:18000/api/health

# 预期输出: {"ok":true}
```

#### 服务状态
```bash
docker compose ps
```

预期输出所有服务状态为 `running` 和 `healthy`。

#### 功能测试
1. 访问 http://localhost:18080
2. 使用管理员账号登录
3. 测试上传档案
4. 测试AI问答功能
5. 测试题库功能

## 环境变量配置

### 核心配置项

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `OPENAI_API_KEY` | 是* | - | OpenAI API密钥，用于AI功能 |
| `OPENAI_MODEL` | 否 | `gpt-4o` | LLM模型选择 |
| `OPENAI_BASE_URL` | 否 | - | 兼容 OpenAI 协议的第三方/自托管地址 |
| `SECRET_KEY` | 是 | `change-me` | JWT签名密钥（生产环境必须修改） |
| `ADMIN_EMAIL` | 否 | `admin@example.com` | 默认管理员邮箱 |
| `ADMIN_PASSWORD` | 否 | `admin123` | 默认管理员密码 |

\* 注：`OPENAI_API_KEY` 技术上可选，但未配置时仅有基础功能（无AI问答，使用哈希向量检索）

### 模型选择对比

| 模型 | 发布时间 | 输入价格 | 输出价格 | 特点 | 推荐场景 |
|------|----------|----------|----------|------|----------|
| **gpt-4o** | 2024.05 | $5.00/1M tokens | $15.00/1M tokens | 质量更高、鲁棒性好 | 默认推荐，质量优先 |
| gpt-4o-mini | 2024.07 | $0.15/1M tokens | $0.60/1M tokens | 成本低，质量次之 | 成本敏感场景 |
| gpt-3.5-turbo | 2023.03 | $0.50/1M tokens | $1.50/1M tokens | 已过时，不推荐 | 不推荐 |

### 端口配置

所有端口均可通过环境变量自定义，避免冲突：

```env
# 前端（Nginx）
FRONTEND_HOST_PORT=18080

# 后端API（FastAPI）
API_HOST_PORT=18000

# PostgreSQL
POSTGRES_HOST_PORT=15433

# MinIO API
MINIO_API_PORT=19002

# MinIO Console
MINIO_CONSOLE_PORT=19003
```

## 生产环境部署

### 安全加固

#### 1. 修改所有默认凭证
```env
# 生成安全的随机密钥
SECRET_KEY=$(openssl rand -hex 32)

# 修改管理员账号
ADMIN_EMAIL=real-admin@yourdomain.com
ADMIN_PASSWORD=$(openssl rand -base64 32)

# MinIO凭证（如果需要外部访问）
MINIO_ROOT_USER=secure-user
MINIO_ROOT_PASSWORD=secure-password-$(openssl rand -hex 16)
```

#### 2. 配置 HTTPS

使用 Nginx 反向代理 + Let's Encrypt：

```nginx
# /etc/nginx/sites-available/sdu-archive
server {
    listen 80;
    server_name archive.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name archive.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/archive.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/archive.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:18080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

获取SSL证书：
```bash
sudo certbot --nginx -d archive.yourdomain.com
```

#### 3. 配置防火墙
```bash
# 仅允许 80/443 端口外部访问
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 其他端口仅本地访问（已由 docker-compose 默认绑定到 127.0.0.1）
```

#### 4. 限制CORS来源
```env
# 仅允许你的域名
CORS_ORIGINS=https://archive.yourdomain.com
```

### 监控与日志

#### 配置日志轮转
```bash
# 创建 Docker 日志配置
sudo nano /etc/docker/daemon.json
```

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

```bash
sudo systemctl restart docker
```

#### 使用 docker-compose 日志限制
```yaml
# docker-compose.yml
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 自动重启

系统级服务（systemd）：

```bash
# 创建服务文件
sudo nano /etc/systemd/system/sdu-archive.service
```

```ini
[Unit]
Description=SDU Archive
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/SDU_Archive
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
# 启用服务
sudo systemctl enable sdu-archive.service
sudo systemctl start sdu-archive.service
```

## 故障排查

### 常见问题

#### 1. 容器无法启动
```bash
# 查看详细日志
docker compose logs -f

# 检查端口占用
sudo lsof -i :18080
sudo lsof -i :18000
```

#### 2. 数据库连接失败
```bash
# 检查数据库健康状态
docker compose exec db pg_isready -U sdu -d sdu_archive

# 查看数据库日志
docker compose logs db

# 手动连接测试
docker compose exec db psql -U sdu -d sdu_archive
```

#### 3. MinIO 连接失败
```bash
# 检查 MinIO 日志
docker compose logs minio

# 验证 MinIO 可访问性
curl http://localhost:19002/minio/health/live
```

#### 4. OpenAI API 错误
```bash
# 检查 API key 是否正确
docker compose exec api python -c "from app.config import get_settings; print(get_settings().openai_api_key)"

# 测试 API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

#### 5. 前端无法访问后端
```bash
# 检查 Nginx 配置
docker compose exec frontend cat /etc/nginx/nginx.conf

# 查看前端日志
docker compose logs frontend

# 测试API直接访问
curl http://localhost:18000/api/health
```

### 性能问题

#### 慢查询优化
```bash
# 进入数据库
docker compose exec db psql -U sdu -d sdu_archive

# 查看慢查询
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

# 检查索引使用
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan;
```

#### 向量检索优化
```sql
-- 添加向量索引（如果未创建）
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
ON chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 分析表统计
ANALYZE chunks;
```

## 性能优化

### 数据库优化

#### 调整 PostgreSQL 配置
```bash
docker compose exec db bash -c "cat >> /var/lib/postgresql/data/postgresql.conf <<EOF
# 内存设置（4GB RAM系统）
shared_buffers = 1GB
effective_cache_size = 3GB
maintenance_work_mem = 256MB
work_mem = 16MB

# 连接设置
max_connections = 100

# WAL设置
wal_buffers = 16MB
checkpoint_completion_target = 0.9
EOF"

# 重启数据库
docker compose restart db
```

### 应用缓存

考虑添加 Redis 用于：
- API响应缓存
- 会话存储
- 速率限制

### CDN配置

对于静态资源（前端），使用 CDN 加速：
- 图片
- CSS/JS文件
- 字体文件

## 备份与恢复

### 数据库备份

#### 自动备份脚本
```bash
#!/bin/bash
# backup-db.sh

BACKUP_DIR="/backup/sdu-archive"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/sdu_archive_$DATE.sql.gz"

mkdir -p $BACKUP_DIR

docker compose exec -T db pg_dump -U sdu sdu_archive | gzip > $BACKUP_FILE

# 保留最近7天的备份
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
```

设置定时任务：
```bash
# 每天凌晨2点备份
crontab -e
0 2 * * * /path/to/backup-db.sh
```

#### 恢复数据库
```bash
# 停止服务
docker compose stop api

# 恢复数据
gunzip < backup.sql.gz | docker compose exec -T db psql -U sdu -d sdu_archive

# 启动服务
docker compose start api
```

### MinIO 数据备份

```bash
# 备份 MinIO 数据
docker compose exec minio mc mirror /data /backup

# 或使用 Docker 卷备份
docker run --rm -v sdu_archive_minio_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/minio-backup.tar.gz /data
```

### 完整系统备份
```bash
#!/bin/bash
# full-backup.sh

BACKUP_DIR="/backup/sdu-archive-full"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR/$DATE

# 备份数据库
docker compose exec -T db pg_dump -U sdu sdu_archive | gzip > $BACKUP_DIR/$DATE/database.sql.gz

# 备份 MinIO 数据
docker run --rm -v sdu_archive_minio_data:/data -v $BACKUP_DIR/$DATE:/backup \
  alpine tar czf /backup/minio.tar.gz /data

# 备份配置文件
cp .env $BACKUP_DIR/$DATE/
cp docker-compose.yml $BACKUP_DIR/$DATE/

echo "Full backup completed: $BACKUP_DIR/$DATE"
```

## 升级指南

### 升级应用
```bash
# 1. 备份数据
./backup-db.sh

# 2. 拉取最新代码
git pull origin main

# 3. 重新构建
docker compose build

# 4. 重启服务
docker compose up -d

# 5. 验证
docker compose ps
curl http://localhost:18000/api/health
```

### 升级 Docker 镜像
```bash
# 拉取最新镜像
docker compose pull

# 重启服务
docker compose up -d
```

## 支持与反馈

- **问题反馈**: https://github.com/shadow-opt/SDU_Archive/issues
- **文档**: https://github.com/shadow-opt/SDU_Archive
- **更新日志**: 查看 Git commits

---

**最后更新**: 2026-02-20
**维护者**: SDU Archive Team
