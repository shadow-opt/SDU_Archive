# 🚀 零基础网站搭建指南

> 这是一份专为「会写代码，但从没搭过网站」的开发者准备的保姆级教程。
>
> 在本地开发时，你的网站只在你的电脑上跑；**部署（Deployment）** 就是把代码放到一台"永远不关机、24 小时联网"的远程电脑（服务器）上，让全世界都能通过网址访问。
>
> 不用紧张，跟着这份指南一步步走就好。

---

## 📑 目录

| 步骤 | 内容 | 预计耗时 |
|:---:|------|:---:|
| 一 | [选购与购买服务器](#一选购与购买服务器) | 10 分钟 |
| 二 | [首次连接服务器（SSH）](#二首次连接服务器ssh) | 5 分钟 |
| 三 | [服务器安全加固](#三服务器安全加固) | 15 分钟 |
| 四 | [安装 Docker](#四安装-docker) | 5 分钟 |
| 五 | [部署网站](#五部署网站) | 10 分钟 |
| 六 | [域名与 HTTPS（可选）](#六域名与-https可选) | 30+ 分钟 |
| 七 | [部署后自检（推荐）](#七部署后自检推荐) | 2 分钟 |

---

## 前置知识速览

在正式开始之前，先花两分钟了解几个你马上会遇到的概念：

| 概念 | 一句话解释 |
|------|-----------|
| **服务器** | 一台放在机房、不关机的 Linux 电脑，你通过网络远程控制它。 |
| **公网 IP** | 服务器在互联网上的"门牌号"，比如 `123.45.67.89`。 |
| **端口（Port）** | 一台电脑可以同时运行很多服务，端口就是用来区分它们的编号（0~65535）。网页默认用 80（HTTP）和 443（HTTPS）。 |
| **SSH** | 一种加密的远程连接协议，让你在自己电脑的终端里操作服务器，就像坐在服务器面前一样。 |
| **Docker** | 把代码和运行环境一起打包成"集装箱（容器）"的工具。不用在服务器上手动装 Python、Node.js、数据库，Docker 帮你全搞定，保证"我这能跑，服务器上也能跑"。 |
| **域名** | 用来代替 IP 地址的人类友好名称，比如 `www.example.com`。 |
| **HTTPS / SSL** | 给你的网站加一把"锁"，浏览器地址栏会显示 🔒，数据传输全程加密。 |
| **备案** | 中国大陆的政策要求：如果你的服务器在国内，绑定的域名**必须**完成工信部备案才能正常访问。海外服务器**不需要**备案。 |

---

## 一、选购与购买服务器

### 你需要什么配置？

本项目包含前端、后端 API、PostgreSQL 数据库和 MinIO 对象存储四个组件，推荐配置：

| 项目 | 最低要求 | 推荐 |
|------|---------|------|
| CPU | 2 核 | 2 核及以上 |
| 内存 | 2 GB | **4 GB** |
| 硬盘 | 40 GB SSD | 60 GB SSD |
| 操作系统 | Ubuntu 22.04 / 24.04 LTS | 同左 |
| 带宽 | 3 Mbps | 5 Mbps 及以上 |

### 选哪家？——两条路线

> **核心决策点**：你的域名是否需要备案？

| | 🇨🇳 国内路线（阿里云） | 🌍 海外路线（无需备案） |
|---|---|---|
| **服务商推荐** | [阿里云 轻量应用服务器](https://www.aliyun.com/product/swas) | [Vultr](https://www.vultr.com/)、[DigitalOcean](https://www.digitalocean.com/)、[Racknerd](https://www.racknerd.com/)（性价比高） |
| **优点** | 国内访问速度快；中文客服；长期包年有折扣 | **不需要域名备案**；注册简单；部署即可绑定域名 |
| **缺点** | 绑定域名需要完成备案（通常 5~15 个工作日）；只用 IP+端口访问则不需要备案 | 国内用户访问可能稍慢（选日本/新加坡/香港节点可缓解） |
| **适合场景** | 面向国内用户的正式网站 | 个人项目、学习用途、不想折腾备案 |

### 阿里云轻量应用服务器购买步骤

1. 前往 [阿里云官网](https://www.aliyun.com/) 注册账号并完成**实名认证**。
2. 搜索「轻量应用服务器」，点击购买。
3. 配置选择：
   - **地域**：选离目标用户最近的城市（如"华东1 杭州"或"华北2 北京"）。
   - **镜像**：系统镜像 → **Ubuntu 22.04** 或 **24.04**。
   - **套餐**：2 核 4G 起步。
   - **时长**：新用户通常有包年特惠，按需选择。
4. 购买完成后，进入控制台 → 找到你的服务器 → 记下 **公网 IP 地址**。
5. 在控制台点击「重置密码」，为 `root` 用户设置一个**高强度密码**（大小写字母+数字+特殊字符）并妥善保存。

### 海外服务商购买步骤（以 Vultr 为例）

1. 前往 [Vultr](https://www.vultr.com/) 注册账号。
2. 点击右上角 **Deploy +** → **Cloud Compute**。
3. 配置选择：
   - **Server Location**：选择 Tokyo（东京）或 Singapore（新加坡），对国内延迟较低。
   - **Image**：Ubuntu 22.04 或 24.04 LTS。
   - **Plan**：选择至少 2 核 4GB 内存的方案。
4. 点击 **Deploy Now**，等待几分钟服务器就绑上线了。
5. 在控制面板找到你的服务器，记下 **IP Address** 和 **Password**。

---

## 二、首次连接服务器（SSH）

无论你选了哪家服务商，接下来的操作都是一样的——通过 SSH 远程登录服务器。

### Windows 用户

打开 **PowerShell**（在开始菜单搜索 `PowerShell`），输入：

```bash
ssh root@你的服务器公网IP
```

> 例如：`ssh root@123.45.67.89`

### macOS / Linux 用户

打开 **终端（Terminal）**，输入同样的命令：

```bash
ssh root@你的服务器公网IP
```

### 首次连接的注意事项

1. 系统会提示：`Are you sure you want to continue connecting (yes/no)?`  
   输入 **`yes`** 然后回车。
2. 接下来输入你在购买服务器时设置的 **root 密码**。  
   ⚠️ **输入密码时屏幕不会显示任何字符**，这是 Linux 的安全设计，不是卡了——直接输完回车即可。
3. 当你看到类似 `root@server:~#` 的提示符时，恭喜你，**你已经登上服务器了**！

> 💡 **小技巧**：如果每次输密码很烦，之后可以搜索「SSH 密钥登录」来配置免密登录。

---

## 三、服务器安全加固

服务器暴露在公网上，全球的自动扫描器会 24 小时不停地试探。以下几步是**最基本的安全措施**，强烈建议完成。

### 3.1 系统更新

```bash
apt update && apt upgrade -y
```

> 这条命令会把服务器上所有系统软件更新到最新版本，修复已知的安全漏洞。

### 3.2 创建普通用户（不再用 root 裸奔）

`root` 是服务器的"上帝账户"，权限无限大。日常操作建议使用一个普通用户，降低误操作风险：

```bash
# 创建一个名为 deploy 的新用户（名字可以自己取）
adduser deploy

# 赋予它 sudo（临时管理员）权限
usermod -aG sudo deploy
```

> 之后你就可以用 `ssh deploy@你的服务器IP` 登录了。需要管理员权限时，在命令前加 `sudo` 即可。

### 3.3 配置防火墙（UFW）

防火墙的作用：**只让你允许的端口对外开放，其余一概拒绝。**

```bash
# 允许 SSH（22端口）—— 不开这个你会把自己锁在门外！
ufw allow 22

# 允许 HTTP（80）和 HTTPS（443）—— 网页访问用
ufw allow 80
ufw allow 443

# 允许项目前端端口（用于 IP:端口直接访问测试，使用域名 + Caddy 后可移除）
ufw allow 18080   # 前端

# 启用防火墙（输入 y 确认）
ufw enable

# 查看当前规则，确认无误
ufw status
```

### 3.4 阿里云用户额外步骤：安全组 / 防火墙

阿里云除了服务器内部的 UFW，在**云平台层面**还有一道独立的防火墙（叫"安全组"或"防火墙"）。你需要去**阿里云控制台**也放行相同的端口：

1. 登录阿里云控制台 → 进入你的轻量应用服务器。
2. 左侧菜单找到「防火墙」或「安全 → 安全组」。
3. 添加规则，放行以下端口：

| 端口 | 用途 |
|------|------|
| 22 | SSH 远程连接 |
| 80 | HTTP 网页访问 |
| 443 | HTTPS 网页访问 |
| 18080 | 本项目前端 |

> ⚠️ **千万不要忘记这一步！** 很多新手在服务器里配好了一切，浏览器却打不开，90% 的原因就是云平台的安全组没放行端口。

---

## 四、安装 Docker

### 什么是 Docker？为什么需要它？

本项目包含 4 个组件：

| 组件 | 说明 |
|------|------|
| **frontend** | React 前端，由 Nginx 托管 |
| **api** | Python FastAPI 后端 |
| **db** | PostgreSQL 数据库 + pgvector 向量检索 |
| **minio** | MinIO 对象存储（存用户上传的文件） |

如果不用 Docker，你需要手动安装 Nginx、Python、PostgreSQL、MinIO，还要操心版本兼容问题。有了 Docker，一条命令就能把这四个组件全部启动。

### 安装命令

在服务器终端依次执行：

```bash
# 下载 Docker 官方安装脚本并执行
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

安装完成后验证一下：

```bash
docker --version
# 输出类似：Docker version 27.x.x, build xxxxxxx 说明成功
```

> 💡 **国内服务器拉取 Docker 镜像很慢？** 可以搜索「Docker 镜像加速器 阿里云」来配置加速，显著提升下载速度。

---

## 五、部署网站

终于到了最激动人心的一步！

### 5.1 安装 Git 并下载代码

```bash
apt update && apt install git -y

# 下载项目代码
git clone https://github.com/shadow-opt/SDU_Archive.git

# 进入项目文件夹
cd SDU_Archive
```

### 5.2 配置环境变量

环境变量是程序运行时读取的"配置项"，用来存放密钥、密码等敏感信息。项目已经提供了一个模板文件：

```bash
# 复制模板
cp .env.example .env

# 用 nano 编辑器打开（新手友好的终端文本编辑器）
nano .env
```

你**必须修改**的项：

| 变量 | 说明 | 怎么填 |
|------|------|--------|
| `SECRET_KEY` | JWT 加密密钥，保护用户登录安全 | 在终端运行 `openssl rand -hex 32` 生成一串随机字符串，粘贴进去 |
| `ADMIN_PASSWORD` | 管理员密码（**必填，需包含字母和数字**） | 设为你自己的强密码 |

可选修改：

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | AI 功能的 API 密钥。填了才有 AI 问答功能；留空网站也能跑，但 AI 相关功能不可用 |
| `OPENAI_API_BASE` | AI API 地址，默认 `https://api.openai.com/v1`。支持任何兼容 OpenAI 格式的服务（见下表） |
| `OPENAI_MODEL` | 模型名称，需与 `OPENAI_API_BASE` 匹配。默认 `gpt-4o-mini` |
| `ADMIN_EMAIL` | 管理员邮箱，默认 `admin@example.com` |

> 💡 **兼容的 AI 服务商**（便宜好用的国产模型也可以！）：
>
> | 服务商 | `OPENAI_API_BASE` | `OPENAI_MODEL` |
> |--------|-------------------|----------------|
> | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
> | **DeepSeek（推荐）** | `https://api.deepseek.com` | `deepseek-chat` |
> | 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
> | 本地 Ollama | `http://localhost:11434/v1` | `qwen2.5` |

其他变量说明（通常保持默认，无需修改）：

| 变量 | 说明 | 默认值 | 需要改吗？ |
|------|------|--------|:----------:|
| `DATABASE_URL` | 数据库连接地址 | Docker 内部地址 | ❌ 不要改 |
| `MINIO_ENDPOINT` | 对象存储地址 | Docker 内部默认值 | ❌ 不要改 |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | 对象存储凭证 | `minioadmin` | 可选 |
| `MINIO_BUCKET` | 对象存储桶名 | `documents` | ❌ 不要改 |
| `RATE_LIMIT_PER_MINUTE` | 每 IP 每分钟最大请求数 | `60` | 可选 |
| `CORS_ORIGINS` | 允许访问的域名列表 | `localhost` | ⚠️ 绑定域名后**必须改** |

> ⚠️ **关于 `CORS_ORIGINS`**：绑定域名后，务必将此值改为你的实际域名（例如 `https://yourdomain.com`），否则前端将无法正常请求后端 API。详见[第六步 HTTPS 配置](#64-配置-https使用-caddy-反向代理)。

编辑完成后：按 `Ctrl + O` → 回车（保存） → `Ctrl + X`（退出编辑器）。

### 5.3 一键启动

```bash
docker compose up -d --build
```

> **这条命令做了什么？**
> - `docker compose up`：按照 `docker-compose.yml` 的描述，一次性启动所有容器。
> - `--build`：首次运行时构建前端和后端的镜像（把代码打包成可运行的"快照"）。
> - `-d`：后台运行（detach），不占用你的终端。
>
> ⏳ 首次启动需要下载数据库镜像并编译代码，**大约需要 3~10 分钟**，取决于服务器带宽和性能。可以泡杯茶等一等。

### 5.4 查看运行状态

```bash
docker compose ps
```

如果看到四个服务（`db`、`minio`、`api`、`frontend`）的状态都是 `Up` 或 `running (healthy)`，**部署成功了！** 🎉

### 5.5 验证部署

容器全部启动后，先在**服务器终端**上验证各服务是否正常：

```bash
# 检查后端 API 健康状态
curl -s http://localhost:18000/api/health
# 应返回类似 {"status":"ok"} 的 JSON

# 检查前端页面
curl -sI http://localhost:18080 | head -n 1
# 应返回 HTTP/1.1 200 OK
```

如果两项检查都通过，说明**部署成功了！** 🎉

> 💡 **为什么要用 `curl` 而不是浏览器？**
> 为了安全，`docker-compose.yml` 中所有端口均绑定到 `127.0.0.1`（仅本机可访问），外部浏览器无法直接通过 `http://IP:18080` 访问。这是推荐的生产配置——后续通过 Caddy 反向代理统一提供 HTTPS 访问（见[第六步](#六域名与-https可选)）。
>
> 如果你想在配置域名前先用浏览器预览网站，可以通过 **SSH 隧道**（在你**自己的电脑**上执行）：
> ```bash
> ssh -L 18080:localhost:18080 root@你的服务器IP
> ```
> 然后在浏览器打开 `http://localhost:18080` 即可预览。

**默认管理员账号**：
- 邮箱：你在 `.env` 中设置的 `ADMIN_EMAIL`（默认 `admin@example.com`）
- 密码：你在 `.env` 中设置的 `ADMIN_PASSWORD`
- 管理后台入口：`/admin/login`

> 🔒 **安全说明**：本系统**已关闭公开注册**，所有用户账号均由管理员在后台创建。登录管理后台后，进入「用户管理」页面，点击「+ 新建用户」按钮即可创建新用户并分配角色。

> ⚠️ **如果 `curl` 检查失败？** 按以下顺序排查：
> 1. `docker compose ps` 看四个容器是否都在运行。
> 2. `docker compose logs api` 看后端是否报错。
> 3. `docker compose logs frontend` 看前端 Nginx 是否报错。
> 4. 如果是云平台，检查安全组是否放行了相应端口。

---

## 六、域名与 HTTPS（可选）

用 `IP:端口` 访问虽然能用，但不正式也不安全（HTTP 明文传输）。如果你想让网站变成 `https://yoursite.com`，请继续。

### 6.1 关于备案的重要说明

| 场景 | 是否需要备案 |
|------|:----------:|
| 国内服务器 + 绑定域名 | ✅ **需要** |
| 国内服务器 + 只用 IP:端口访问 | ❌ 不需要 |
| 海外服务器 + 绑定域名 | ❌ **不需要** |

**如果你用的是阿里云等国内服务器，并且想绑定域名**：
- 你需要在阿里云控制台完成 [ICP 备案](https://beian.aliyun.com/)。
- 流程：填写网站信息 → 人脸核验 → 提交管局审核 → 等待 5~15 个工作日。
- 备案期间网站可以正常用 IP:端口访问，不受影响。
- 备案通过后才能将域名解析到国内服务器。

**如果你用的是海外服务器**：跳过备案，直接往下走。

### 6.2 购买域名

推荐的域名注册商：
- 国内：[阿里云 万网](https://wanwang.aliyun.com/)、[腾讯云 DNSPod](https://dnspod.cloud.tencent.com/)
- 海外（不需要实名）：[Namecheap](https://www.namecheap.com/)、[Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)

挑一个你喜欢的域名，完成购买。

### 6.3 解析域名到服务器

在域名注册商的 DNS 管理页面，添加一条 **A 记录**：

| 记录类型 | 主机记录 | 记录值 | TTL |
|---------|---------|--------|-----|
| A | `@` | 你的服务器公网 IP | 600 |
| A | `www` | 你的服务器公网 IP | 600 |

> `@` 代表根域名（`yoursite.com`），`www` 代表 `www.yoursite.com`。

设置好后等几分钟，在终端验证：

```bash
ping yoursite.com
# 如果解析成功，会显示你服务器的 IP
```

### 6.4 配置 HTTPS（使用 Caddy 反向代理）

为了让网站可以通过 `https://yoursite.com`（不带端口号）访问，你需要一个**反向代理**把 80/443 端口的请求转发到项目的 18080 端口，并自动申请 SSL 证书。

这里推荐 **Caddy**——它是对新手最友好的方案，**自动申请和续期 HTTPS 证书**，几行配置就搞定。

#### 安装 Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl

# 添加 Caddy 官方软件源
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list

# 更新并安装
sudo apt update
sudo apt install caddy -y
```

> 💡 如果上面的命令报错，可以访问 [Caddy 官方安装文档](https://caddyserver.com/docs/install#debian-ubuntu-raspbian) 获取最新安装方式。

#### 编写配置文件

```bash
nano /etc/caddy/Caddyfile
```

将内容替换为（把 `yoursite.com` 换成你的真实域名）：

```
yoursite.com {
    reverse_proxy localhost:18080
}
```

是的，**就这两行**。Caddy 会自动：
1. 监听 80 和 443 端口。
2. 向 Let's Encrypt 申请免费 SSL 证书。
3. 把所有 HTTP 请求自动跳转到 HTTPS。
4. 把请求转发给你运行在 18080 端口的前端。

保存退出后，重启 Caddy：

```bash
sudo systemctl restart caddy
```

#### 验证

等待约 30 秒，打开浏览器访问：

```
https://yoursite.com
```

看到地址栏的 🔒 和你的网站页面，就大功告成了！

> 💡 **架构说明**：Caddy 只需要反代前端的 18080 端口。因为前端容器内部的 Nginx 已经配好了规则——所有 `/api/` 开头的请求会自动转发到后端，所以不需要单独给后端配反向代理。

#### 更新 CORS 配置（重要！）

绑定域名后，**必须更新** `.env` 中的 `CORS_ORIGINS`，否则前端将无法正常请求后端 API（浏览器会报跨域错误）：

```bash
cd ~/SDU_Archive
nano .env
```

找到 `CORS_ORIGINS` 那一行，改为你的实际域名：

```
CORS_ORIGINS=https://yourdomain.com
```

保存退出后，重启服务使配置生效：

```bash
docker compose up -d
```

---

## 七、部署后自检（推荐）

部署完成后，建议运行项目自带的冒烟测试脚本，自动验证所有核心功能是否正常：

```bash
cd ~/SDU_Archive

# 加载 .env 中的环境变量（脚本需要用管理员密码进行登录测试）
set -a && source .env && set +a

bash scripts/smoke.sh
```

脚本会依次检查：
- ✅ API 健康接口可用
- ✅ 前端首页可访问
- ✅ 未登录请求返回 `401`（鉴权正常）
- ✅ 管理员登录成功且角色正确
- ✅ 管理员受保护接口可访问（仪表盘、切片管理、用户管理）
- ✅ 题目创建与删除（写操作回归）

全部通过后会输出 `✅ smoke passed`。如有失败项，脚本会打印具体错误信息，方便定位问题。

---

## 常见问题（FAQ）

### Q：`docker compose up` 时拉取镜像特别慢 / 超时怎么办？
**A**：国内服务器访问 Docker Hub 较慢。搜索「**阿里云 Docker 镜像加速器**」配置加速。具体步骤：阿里云控制台 → 搜索「容器镜像服务」→ 镜像加速器 → 按文档配置 `/etc/docker/daemon.json`。

### Q：浏览器打不开网站？
**A**：按以下顺序排查：
1. `docker compose ps` 看四个容器是否都在运行。
2. `docker compose logs api` 看后端是否报错。
3. 如果通过域名访问：检查 Caddy 是否正常运行（`sudo systemctl status caddy`），DNS 是否解析到服务器 IP（`ping yoursite.com`）。
4. 如果通过 `IP:18080` 访问：确认 UFW 和云平台安全组已放行 18080 端口。注意 `docker-compose.yml` 默认将端口绑定到 `127.0.0.1`，需要修改为 `0.0.0.0:18080:80` 才能从外部访问。

### Q：`docker compose up` 报错 `SECRET_KEY` 相关错误？
**A**：你忘了配置 `.env` 文件。回到[第 5.2 节](#52-配置环境变量)操作。

### Q：如何更新网站代码？
**A**：
```bash
cd SDU_Archive
git pull
docker compose up -d --build
```

### Q：如何查看服务日志？
**A**：
```bash
# 查看所有服务的日志
docker compose logs

# 只看后端日志（最后 50 行）
docker compose logs --tail 50 api

# 实时跟踪日志（Ctrl+C 退出）
docker compose logs -f api
```

### Q：我用了海外服务器，国内用户访问很慢怎么办？
**A**：选服务器时优先选 **日本东京、新加坡、中国香港** 节点，延迟通常在 50~100ms，日常使用体感差别不大。

---

🎉 **恭喜你完成了从零到一的网站搭建！** 这是一项非常实用的技能，不管以后做什么项目，这套流程都大同小异。享受你的全栈开发者之旅吧！
