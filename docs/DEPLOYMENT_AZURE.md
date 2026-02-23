# 🚀 零基础网站搭建指南（Microsoft Azure 篇）

> 这是一份专为「会写代码，但从没搭过网站」的开发者准备的保姆级教程。
>
> 在本地开发时，你的网站只在你的电脑上跑；**部署（Deployment）** 就是把代码放到一台"永远不关机、24 小时联网"的远程电脑（服务器）上，让全世界都能通过网址访问。
>
> 本指南专门针对 **Microsoft Azure（微软云）** 编写。选择 Azure 国际区（如日本、新加坡、美国节点）的**最大优势是：绑定域名不需要进行繁琐的国内 ICP 备案**，买完域名解析后立刻就能用。

---

## 📑 目录

| 步骤 | 内容 | 预计耗时 |
|:---:|------|:---:|
| 一 | [在 Azure 创建虚拟机（服务器）](#一在-azure-创建虚拟机服务器) | 15 分钟 |
| 二 | [首次连接服务器（SSH 密钥）](#二首次连接服务器ssh-密钥) | 10 分钟 |
| 三 | [配置网络安全组（开放端口）](#三配置网络安全组开放端口) | 5 分钟 |
| 四 | [服务器安全加固](#四服务器安全加固) | 10 分钟 |
| 五 | [安装 Docker](#五安装-docker) | 5 分钟 |
| 六 | [部署网站](#六部署网站) | 10 分钟 |
| 七 | [域名与 HTTPS（免备案）](#七域名与-https免备案) | 20 分钟 |
| 八 | [部署后自检（推荐）](#八部署后自检推荐) | 2 分钟 |
| — | [常见问题（FAQ）](#常见问题faq) | — |

---

## 前置知识速览

在正式开始之前，先花两分钟了解几个你马上会遇到的概念：

| 概念 | 一句话解释 |
|------|-----------|
| **服务器** | 一台放在机房、不关机的 Linux 电脑，你通过网络远程控制它。 |
| **公网 IP** | 服务器在互联网上的"门牌号"，比如 `123.45.67.89`。 |
| **端口（Port）** | 一台电脑可以同时运行很多服务，端口就是用来区分它们的编号（0~65535）。网页默认用 80（HTTP）和 443（HTTPS）。 |
| **SSH** | 一种加密的远程连接协议，让你在自己电脑的终端里操作服务器，就像坐在服务器面前一样。 |
| **SSH 密钥对** | Azure 推荐的登录方式，比密码更安全。它包含一把"公钥"（放在服务器上）和一把"私钥"（下载到你电脑上的 `.pem` 文件）。你必须拿着私钥文件才能登录服务器。 |
| **Docker** | 把代码和运行环境一起打包成"集装箱（容器）"的工具。不用在服务器上手动装 Python、Node.js、数据库，Docker 帮你全搞定。 |
| **域名** | 用来代替 IP 地址的人类友好名称，比如 `www.example.com`。 |
| **HTTPS / SSL** | 给你的网站加一把"锁"，浏览器地址栏会显示 🔒，数据传输全程加密。 |
| **虚拟机 (VM)** | 就是你在云端租用的一台电脑（服务器）。 |
| **资源组 (Resource Group)** | Azure 里的一个"文件夹"，用来把你的服务器、硬盘、IP 地址等相关资源打包放在一起，方便管理和删除。 |
| **网络安全组 (NSG)** | Azure 的云端防火墙。它决定了哪些端口（通道）可以被外网访问。如果不在这里放行端口，你的网站就打不开。 |

---

## 一、在 Azure 创建虚拟机（服务器）

### 你需要什么配置？

本项目包含前端、后端 API、PostgreSQL 数据库和 MinIO 对象存储四个组件，推荐配置：

| 项目 | 最低要求 | 推荐 |
|------|---------|------|
| CPU | 2 核 | 2 核及以上 |
| 内存 | 2 GB | **4 GB** |
| 硬盘 | 40 GB SSD | **60 GB SSD**（数据库和上传文件会占空间） |
| 操作系统 | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |

> 💰 **费用参考**：Azure `Standard_B2s`（2 vCPU / 4 GiB）在日本东部区域约 $30~40/月。新用户注册通常有 $200 免费额度（12 个月内可用）。

### 1. 登录与准备
1. 前往 [Azure Portal (门户)](https://portal.azure.com/) 并登录你的微软账号。
2. 如果你是新用户，可以注册 Azure 免费账户（通常会赠送一定的额度）。

### 2. 创建虚拟机
1. 在顶部搜索栏输入 **Virtual Machines**（虚拟机），点击进入。
2. 点击左上角的 **创建 (Create)** -> **Azure 虚拟机 (Azure virtual machine)**。
3. **基本 (Basics) 配置**：
- **订阅 (Subscription)**：选择你的计费订阅。
- **资源组 (Resource Group)**：点击"新建 (Create new)"，随便起个名字，比如 `SDU-Archive-RG`。
- **虚拟机名称 (Virtual machine name)**：随便起，比如 `sdu-server`。
- **区域 (Region)**：选择离你或目标用户近的区域。推荐 **Japan East (日本东部)** 或 **Southeast Asia (新加坡)**，国内访问速度较快且**无需备案**。
- **映像 (Image)**：选择 **Ubuntu Server 22.04 LTS** 或 **24.04 LTS**（x64 Gen2）。
- **大小 (Size)**：点击"查看所有大小"，选择 **Standard_B2s**（2 vCPU, 4 GiB 内存）或更高配置。
4. **磁盘 (Disks)**：
- 建议将 OS 磁盘大小调整为 **64 GB**（默认 30 GB 可能不够用）。
5. **管理员帐户 (Administrator account)**：
- **身份验证类型**：选择 **SSH 公钥 (SSH public key)**（最安全）。
- **用户名**：默认是 `azureuser`，保持不变即可。
- **SSH 公钥源**：选择"生成新密钥对 (Generate new key pair)"。
- **密钥对名称**：随便起，比如 `sdu-server-key`。
6. **入站端口规则 (Inbound port rules)**：
- 公共入站端口：选择"允许所选端口"。
- 选择入站端口：勾选 **SSH (22)**、**HTTP (80)**、**HTTPS (443)**。
7. 点击左下角的 **查看 + 创建 (Review + create)**。
8. 验证通过后，点击 **创建 (Create)**。

### 3. 下载私钥（极其重要！）
点击创建后，会弹出一个窗口提示"生成新密钥对"。
👉 **点击「下载私钥并创建资源 (Download private key and create resource)」**。
浏览器会下载一个以 `.pem` 结尾的文件（例如 `sdu-server-key.pem`）。**请妥善保存这个文件，这是你登录服务器的唯一凭证，丢失后无法找回！**

等待几分钟，直到页面显示"你的部署已完成 (Your deployment is complete)"。点击"转到资源 (Go to resource)"，在概览页面记下你的 **公共 IP 地址 (Public IP address)**。

### 4. 设置静态公网 IP（强烈推荐）

> ⚠️ **Azure 默认分配的是"动态"公网 IP**，每次你重启虚拟机，IP 地址可能会变！如果你打算绑定域名，这一步**必须做**。

1. 在虚拟机概览页面，点击公共 IP 地址（蓝色链接），进入 IP 地址资源页面。
2. 点击左侧菜单的 **配置 (Configuration)**。
3. 将"分配 (Assignment)"从 **动态 (Dynamic)** 改为 **静态 (Static)**。
4. 点击 **保存 (Save)**。

现在你的 IP 地址不会因为重启而改变了。

---

## 二、首次连接服务器（SSH 密钥）

现在我们要通过刚才下载的 `.pem` 密钥文件，远程操控这台服务器。

### Windows 用户

打开 **PowerShell**（在开始菜单搜索 `PowerShell`）。假设你下载的密钥文件在 `Downloads` 文件夹中：

```powershell
# 进入下载文件夹
cd ~\Downloads

# 使用 -i 参数指定密钥文件进行登录（把 IP 换成你的真实公网 IP）
ssh -i .\sdu-server-key.pem azureuser@你的服务器公网IP
```

### macOS / Linux 用户

打开 **终端 (Terminal)**。在 Mac/Linux 系统中，SSH 对密钥文件的权限要求非常严格，必须先修改权限才能使用：

```bash
# 进入下载文件夹
cd ~/Downloads

# 修改密钥文件权限，设为仅自己可读（极其重要，否则 SSH 会拒绝连接）
chmod 400 sdu-server-key.pem

# 使用密钥登录（把 IP 换成你的真实公网 IP）
ssh -i sdu-server-key.pem azureuser@你的服务器公网IP
```

### 首次连接提示
系统会提示：`Are you sure you want to continue connecting (yes/no)?`
输入 **`yes`** 然后回车。

当你看到类似 `azureuser@sdu-server:~$` 的提示符时，恭喜你，**你已经登上服务器了**！

> 💡 **小技巧**：之后每次想连接服务器，只需要打开终端，按键盘 `↑` 上箭头找回之前的 `ssh -i ...` 命令，回车即可。

---

## 三、配置网络安全组（开放端口）

创建虚拟机时我们已开放了 SSH (22)、HTTP (80) 和 HTTPS (443) 端口。如果你想在配置域名之前通过 `IP:18080` 快速验证网站，还需要在 Azure 网络安全组（NSG）中放行前端端口。

> 🔒 **安全架构说明**：本项目的后端 API (18000)、数据库 (15433)、MinIO (19002/19003) 均绑定在 `127.0.0.1`（仅本机可访问），**不需要也不应该在 NSG 中对外暴露**。前端 Nginx 容器已内置 `/api` 反向代理，外部流量只需经过前端即可完成所有操作。

1. 回到 Azure Portal 网页，进入你的虚拟机概览页面。
2. 在左侧菜单找到 **网络 (Networking)**。
3. 在"入站端口规则 (Inbound port rules)"列表上方，点击 **添加入站端口规则 (Add inbound port rule)**。
4. 在右侧弹出的面板中配置：
   - **目标端口范围 (Destination port ranges)**：输入 `18080`。
   - **协议 (Protocol)**：选择 **TCP**。
   - **操作 (Action)**：选择 **允许 (Allow)**。
   - **优先级 (Priority)**：保持默认（如 310）。
   - **名称 (Name)**：随便起，比如 `Allow-SDU-Frontend`。
5. 点击 **添加 (Add)**。等待几秒钟，规则生效。

> 💡 **如果你打算直接使用域名 + Caddy 访问**（推荐），可以跳过此步骤——Caddy 使用 80/443 端口，已在创建虚拟机时放行。

## 四、服务器安全加固

服务器暴露在公网上，全球的自动扫描器会 24 小时不停地试探。以下几步是**最基本的安全措施**，强烈建议完成。

### 4.1 系统更新

```bash
sudo apt update && sudo apt upgrade -y
```

> 这条命令会把服务器上所有系统软件更新到最新版本，修复已知的安全漏洞。

### 4.2 创建普通用户（可选）

虽然 `azureuser` 不是 root，但建议创建一个专用的部署用户，降低误操作风险：

```bash
# 创建一个名为 deploy 的新用户（名字可以自己取）
sudo adduser deploy

# 赋予它 sudo（临时管理员）权限
sudo usermod -aG sudo deploy
```

> 💡 这一步是可选的。如果你觉得麻烦，继续用 `azureuser` 也完全没问题，下面的操作不受影响。

### 4.3 配置防火墙（UFW）

Azure 的网络安全组（NSG）是**云平台层面**的防火墙，而 UFW 是**服务器内部**的防火墙。两层防护更安全。

```bash
# 允许 SSH（22端口）—— 不开这个你会把自己锁在门外！
sudo ufw allow 22

# 允许 HTTP（80）和 HTTPS（443）—— 网页访问和域名证书验证用
sudo ufw allow 80
sudo ufw allow 443

# 允许项目前端端口（用于 IP:端口直接访问测试，使用域名 + Caddy 后可移除）
sudo ufw allow 18080   # 前端

# 启用防火墙（会提示 Command may disrupt existing SSH connections，输入 y 确认）
sudo ufw enable

# 查看当前规则，确认无误
sudo ufw status
```

> 🔒 **安全提示**：后端 API（18000）、数据库（15433）和 MinIO（19002/19003）均绑定在 `127.0.0.1`，**不需要也不应该**对外开放。如果你需要从本地电脑直接连数据库调试，可以临时用 SSH 隧道：
> ```bash
> # 在你自己的电脑上执行（不是在服务器上）
> ssh -i sdu-server-key.pem -L 15433:localhost:15433 azureuser@你的服务器IP
> # 然后就可以用 localhost:15433 连接远程数据库了
> ```

---

## 五、安装 Docker

### 什么是 Docker？为什么需要它？

本项目包含 4 个组件：

| 组件 | 说明 |
|------|------|
| **frontend** | React 前端网页，由 Nginx 托管 |
| **api** | Python FastAPI 后端接口 |
| **db** | PostgreSQL 数据库 + pgvector 向量检索 |
| **minio** | MinIO 对象存储（存用户上传的文件） |

如果不用 Docker，你需要手动安装 Nginx、Python、PostgreSQL、MinIO，还要操心版本兼容问题。有了 Docker，一条命令就能把这四个组件全部启动。

### 安装命令

在服务器终端依次执行：

```bash
# 下载 Docker 官方安装脚本并执行
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 将当前用户加入 docker 组，这样以后运行 docker 就不需要加 sudo 了
sudo usermod -aG docker $USER
```

👉 **重要操作**：为了让用户组变更生效，你需要**断开连接并重新登录**。
输入 `exit` 回车退出服务器，然后按键盘的 `↑` 上箭头键找回刚才的 `ssh -i ...` 命令，重新连接服务器。

重新连接后，验证安装：
```bash
docker --version
# 输出类似：Docker version 27.x.x, build xxxxxxx 说明成功
```

---

## 六、部署网站

终于到了最激动人心的一步！

### 6.1 下载代码

```bash
# 安装 git 工具
sudo apt install git -y

# 下载项目代码
git clone https://github.com/shadow-opt/SDU_Archive.git

# 进入项目文件夹
cd SDU_Archive
```

### 6.2 配置环境变量

环境变量是程序运行时读取的"配置项"，用来存放密钥、密码等敏感信息。项目已经提供了一个模板文件：

```bash
# 复制模板
cp .env.example .env

# 用 nano 编辑器打开（新手友好的终端文本编辑器）
nano .env
```

> 📖 **nano 编辑器快速入门**：
> - 用方向键移动光标，直接打字就是编辑
> - `Ctrl + O` → 回车 = 保存
> - `Ctrl + X` = 退出
> - `Ctrl + W` = 搜索

#### 你**必须修改**的变量

| 变量 | 说明 | 怎么填 |
|------|------|--------|
| `SECRET_KEY` | JWT 加密密钥，保护用户登录安全 | 在终端运行 `openssl rand -hex 32` 生成一串随机字符串，粘贴进去 |
| `ADMIN_PASSWORD` | 管理员密码 | 换一个你自己的强密码（至少 8 位，建议包含大小写和数字） |

#### AI 功能配置（可选但推荐）

本项目的 AI 问答功能兼容所有提供 **OpenAI 格式 API** 的服务。你不一定要用 OpenAI，国产模型（便宜又好用）也完全可以：

| 服务商 | `OPENAI_API_BASE` | `OPENAI_MODEL` | 价格参考 |
|--------|-------------------|----------------|----------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | ~$0.15/百万 token |
| **DeepSeek（推荐）** | `https://api.deepseek.com` | `deepseek-chat` | ¥1/百万 token（极便宜） |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | 按量计费 |
| 本地 Ollama | `http://localhost:11434/v1` | `qwen2.5` | 免费（需要 GPU） |

> 💡 **没有 API Key？** 没关系，这三行全部留空，网站照样能运行，只是 AI 问答功能不可用。其他所有功能（上传文档、题库、用户管理等）完全正常。

#### 其他变量说明

| 变量 | 说明 | 默认值 | 需要改吗？ |
|------|------|--------|:----------:|
| `ADMIN_EMAIL` | 管理员登录邮箱 | `admin@example.com` | 可选 |
| `DATABASE_URL` | 数据库连接地址 | Docker 内部地址 | ❌ 不要改 |
| `MINIO_*` | 对象存储配置 | Docker 内部默认值 | ❌ 不要改 |
| `RATE_LIMIT_PER_MINUTE` | 每个 IP 每分钟最多请求次数 | `60` | 可选 |
| `CORS_ORIGINS` | 允许访问的域名列表 | `localhost` | ⚠️ 绑定域名后**必须改** |

> ⚠️ **关于 `CORS_ORIGINS`**：绑定域名后，务必把这个值改成你的实际域名，例如 `https://yourdomain.com`，否则前端可能无法正常请求后端 API。

### 6.3 一键启动

```bash
docker compose up -d --build
```

> **这条命令做了什么？**
> - `docker compose up`：按照 `docker-compose.yml` 的描述，一次性启动所有容器。
> - `--build`：构建前端和后端的镜像（把代码打包成可运行的"快照"）。
> - `-d`：后台运行（detach），不占用你的终端。
>
> ⏳ 首次启动需要下载数据库镜像并编译代码，**大约需要 3~10 分钟**，取决于服务器带宽和性能。可以泡杯茶等一等。

### 6.4 查看运行状态

```bash
docker compose ps
```

如果看到四个服务（`db`、`minio`、`api`、`frontend`）的状态都是 `Up` 或 `running (healthy)`，**部署成功了！** 🎉

如果有容器状态异常，查看日志排查原因：

```bash
# 查看所有服务的日志
docker compose logs

# 只看后端日志（最后 50 行）
docker compose logs --tail 50 api
```

### 6.5 验证部署

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
> 为了安全，`docker-compose.yml` 中所有端口均绑定到 `127.0.0.1`（仅本机可访问），外部浏览器无法直接通过 `http://IP:18080` 访问。这是推荐的生产配置——后续通过 Caddy 反向代理统一提供 HTTPS 访问（见[第七步](#七域名与-https免备案)）。
>
> 如果你想在配置域名前先用浏览器预览网站，可以通过 **SSH 隧道**（在你**自己的电脑**上执行）：
> ```bash
> ssh -i sdu-server-key.pem -L 18080:localhost:18080 azureuser@你的服务器IP
> ```
> 然后在浏览器打开 `http://localhost:18080` 即可预览。

**默认管理员账号**：
- 邮箱：你在 `.env` 中设置的 `ADMIN_EMAIL`（默认 `admin@example.com`）
- 密码：你在 `.env` 中设置的 `ADMIN_PASSWORD`
- 管理后台入口：`/admin/login`

> 🔒 **安全说明**：本系统**已关闭公开注册**，所有用户账号均由管理员在后台创建。登录管理后台后，进入「用户管理」页面，点击「+ 新建用户」按钮即可创建新用户并分配角色。

> ⚠️ **如果 `curl` 检查失败？** 按以下顺序排查：
> 1. 运行 `docker compose ps`，看四个容器是否都在运行。
> 2. 运行 `docker compose logs api`，看后端是否有报错信息。
> 3. 运行 `docker compose logs frontend`，看前端 Nginx 是否有报错。

---

## 七、域名与 HTTPS（免备案）

用 `IP:端口` 访问不正式也不安全。因为你使用的是 Azure 海外节点，**不需要进行国内的 ICP 备案**，买完域名马上就能用。

### 7.1 购买域名

推荐在 **Cloudflare** 购买域名（成本价、零加价、DNS 管理自带），也可以选 Namecheap：

- [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) — 成本价，`.com` 约 $10/年
- [Namecheap](https://www.namecheap.com/) — 老牌域名商

> 📖 **Cloudflare 购买域名步骤**：
> 1. 前往 [dash.cloudflare.com](https://dash.cloudflare.com) 注册账号。
> 2. 点击左侧菜单 **域注册 (Domain Registration)** → **注册域名 (Register Domains)**。
> 3. 搜索你想要的域名（比如 `sdu-archive.com`），加入购物车并完成付款。
> 4. 付款后域名会自动添加到你的 Cloudflare 账户，DNS 管理页面也立即可用。

### 7.2 解析域名到服务器

在域名注册商的 DNS 管理页面，添加 **A 记录**，把域名指向你的 Azure 服务器 IP：

| 记录类型 | 名称 | 内容 | 代理状态 | TTL |
|---------|------|------|---------|-----|
| A | `@` | 你的 Azure 服务器公网 IP | **仅 DNS（灰色云朵）** | 自动 |
| A | `www` | 你的 Azure 服务器公网 IP | **仅 DNS（灰色云朵）** | 自动 |

> ⚠️ **重要：Cloudflare 的代理状态请选择"仅 DNS"（灰色云朵 ☁️）**，不要选橙色云朵。原因：
> - 本项目有 **SSE 流式问答**，Cloudflare 代理会导致流式响应被缓冲或超时截断。
> - 我们用 Caddy 做 HTTPS，开 Cloudflare 代理会导致证书冲突。
> - 灰色云朵 = 只做 DNS 解析，不走 Cloudflare 代理，最简单可靠。

> 如果你用的是 **Namecheap** 等其他注册商：找到 DNS 管理页面，添加同样的 A 记录即可。如果想用 Cloudflare 的免费 DNS 管理（推荐），可以在注册商处将 NS（域名服务器）记录改为 Cloudflare 提供的 NS 地址。

设置好后等几分钟，在服务器终端验证：

```bash
# 把 yoursite.com 换成你的真实域名
ping yoursite.com
# 如果显示你的服务器 IP，说明解析成功
```

### 7.3 配置 HTTPS（使用 Caddy 反向代理）

现在要让网站可以通过 `https://yoursite.com`（不带端口号）访问，并自动加上安全锁 🔒。我们使用 **Caddy**——对新手最友好的方案，**自动申请和续期 HTTPS 证书**，几行配置就搞定。

#### 架构说明（为什么只代理 18080？）

```
用户浏览器 → https://yoursite.com
       ↓
   Caddy (:443)  ← 自动 HTTPS 证书
       ↓
   Docker: frontend (Nginx :18080)
       ├── /          → 前端静态页面（React）
       └── /api/*     → 转发给后端 API (FastAPI :8000)
                           ├── Docker: db (PostgreSQL)
                           └── Docker: minio (文件存储)
```

Caddy 只需要把请求转发到前端的 `18080` 端口。前端容器内部的 Nginx 已经配好了规则：访问 `/api/` 开头的请求会自动转发到后端，所以**不需要单独给后端配反向代理**。

#### 安装 Caddy

```bash
# 安装依赖
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
sudo nano /etc/caddy/Caddyfile
```

将里面的内容**全部删掉**（`Ctrl+A` 全选，然后 `Backspace` 删除），替换为以下两行（把 `yoursite.com` 换成你的真实域名）：

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

保存退出（`Ctrl+O` → 回车 → `Ctrl+X`），然后重启 Caddy：

```bash
sudo systemctl restart caddy

# 查看 Caddy 状态，确认正在运行
sudo systemctl status caddy
```

#### 更新 CORS 配置

绑定域名后，**别忘了更新 `.env` 中的 `CORS_ORIGINS`**：

```bash
cd ~/SDU_Archive
nano .env
```

找到 `CORS_ORIGINS` 那一行，改为：

```
CORS_ORIGINS=https://yoursite.com
```

然后重启后端服务让配置生效：

```bash
docker compose up -d
```

#### 验证

等待约 30 秒，打开浏览器访问：

```
https://yoursite.com
```

看到地址栏的 🔒 和你的网站页面，就大功告成了！ 🎉

---

## 八、部署后自检（推荐）

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

### Q：浏览器打不开网站？

**A**：按以下顺序排查（从最常见到最少见）：

1. **检查容器运行状态**：
   ```bash
   docker compose ps
   ```
   四个容器都应该是 `Up` 或 `running (healthy)` 状态。

2. **查看后端日志是否报错**：
   ```bash
   docker compose logs --tail 50 api
   ```

3. **如果通过域名访问**：检查 Caddy 是否正常运行（`sudo systemctl status caddy`），以及域名 DNS 是否解析到服务器 IP（`ping yoursite.com`）。

4. **如果通过 `IP:18080` 访问**：确认 Azure NSG 和 UFW 均已放行 18080 端口。注意 `docker-compose.yml` 默认将端口绑定到 `127.0.0.1`，需要修改为 `0.0.0.0:18080:80` 才能从外部访问。

### Q：`docker compose up` 时拉取镜像特别慢/超时怎么办？

**A**：Azure 海外节点拉取 Docker Hub 通常很快。如果遇到问题：
```bash
# 先单独拉取基础镜像
docker pull python:3.11-slim
docker pull node:22-alpine
docker pull pgvector/pgvector:pg16
docker pull minio/minio:latest

# 然后再启动
docker compose up -d --build
```

### Q：`docker compose up` 报错 `SECRET_KEY` 相关错误？

**A**：你忘了配置 `.env` 文件。回到[第 6.2 节](#62-配置环境变量)操作。

### Q：如何更新网站代码？

**A**：
```bash
cd ~/SDU_Archive
git pull
docker compose up -d --build
```

> 只需要这三步！`git pull` 拉取最新代码，`--build` 会自动重新构建镜像。

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

### Q：配置了域名后，用 `IP:18080` 还能访问吗？

**A**：能。Caddy 是额外加的一层，不影响原来的端口访问。但建议通过域名访问（HTTPS 更安全）。

### Q：Caddy 证书申请失败？

**A**：常见原因：
1. **域名 DNS 还没生效**：运行 `ping yoursite.com` 确认解析到了你的服务器 IP。DNS 传播通常几分钟，最多 48 小时。
2. **80 端口被占用**：Caddy 需要 80 端口来验证域名。运行 `sudo lsof -i :80` 检查。
3. **防火墙没开 80/443**：Let's Encrypt 需要通过 80 端口验证你对域名的所有权。

### Q：如何完全重启所有服务？

**A**：
```bash
cd ~/SDU_Archive
docker compose down     # 停止并删除所有容器（数据不会丢失）
docker compose up -d --build   # 重新构建并启动
```

> 💡 `docker compose down` 只删除容器，不会删除数据库数据和上传的文件（它们存储在 Docker volumes 中）。如果你想**彻底清除所有数据**重来，加上 `-v` 参数：`docker compose down -v`（⚠️ 谨慎操作！）。

---

🎉 **恭喜你完成了从零到一的网站搭建！** 这是一项非常实用的技能，不管以后做什么项目，这套流程都大同小异。享受你的全栈开发者之旅吧！
