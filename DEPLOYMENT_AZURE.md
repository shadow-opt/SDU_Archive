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
| 四 | [安装 Docker](#四安装-docker) | 5 分钟 |
| 五 | [部署网站](#五部署网站) | 10 分钟 |
| 六 | [域名与 HTTPS（免备案）](#六域名与-https免备案) | 20 分钟 |

---

## 前置知识速览

在正式开始之前，先花两分钟了解几个 Azure 特有的概念：

| 概念 | 一句话解释 |
|------|-----------|
| **虚拟机 (VM)** | 就是你在云端租用的一台电脑（服务器）。 |
| **资源组 (Resource Group)** | Azure 里的一个"文件夹"，用来把你的服务器、硬盘、IP 地址等相关资源打包放在一起，方便管理和删除。 |
| **网络安全组 (NSG)** | Azure 的云端防火墙。它决定了哪些端口（通道）可以被外网访问。如果不在这里放行端口，你的网站就打不开。 |
| **SSH 密钥对** | Azure 强烈推荐的登录方式，比密码更安全。它包含一把"公钥"（放在服务器上）和一把"私钥"（下载到你电脑上的 `.pem` 文件）。你必须拿着私钥文件才能登录服务器。 |

---

## 一、在 Azure 创建虚拟机（服务器）

本项目包含前端、后端 API、PostgreSQL 数据库和 MinIO 对象存储四个组件，推荐至少使用 **2核 CPU / 4GB 内存** 的配置。

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
4. **管理员帐户 (Administrator account)**：
   - **身份验证类型**：选择 **SSH 公钥 (SSH public key)**（最安全）。
   - **用户名**：默认是 `azureuser`，保持不变即可。
   - **SSH 公钥源**：选择"生成新密钥对 (Generate new key pair)"。
   - **密钥对名称**：随便起，比如 `sdu-server-key`。
5. **入站端口规则 (Inbound port rules)**：
   - 公共入站端口：选择"允许所选端口"。
   - 选择入站端口：勾选 **SSH (22)**、**HTTP (80)**、**HTTPS (443)**。
6. 点击左下角的 **查看 + 创建 (Review + create)**。
7. 验证通过后，点击 **创建 (Create)**。

### 3. 下载私钥（极其重要！）
点击创建后，会弹出一个窗口提示"生成新密钥对"。
👉 **点击「下载私钥并创建资源 (Download private key and create resource)」**。
浏览器会下载一个以 `.pem` 结尾的文件（例如 `sdu-server-key.pem`）。**请妥善保存这个文件，这是你登录服务器的唯一凭证，丢失后无法找回！**

等待几分钟，直到页面显示"你的部署已完成 (Your deployment is complete)"。点击"转到资源 (Go to resource)"，在概览页面记下你的 **公共 IP 地址 (Public IP address)**。

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

---

## 三、配置网络安全组（开放端口）

我们的项目需要用到 `18080`（前端）和 `18000`（后端 API）端口。虽然我们在创建时开放了 80 和 443，但还需要在 Azure 的网络安全组（NSG）中把这两个自定义端口也打开。

1. 回到 Azure Portal 网页，进入你的虚拟机概览页面。
2. 在左侧菜单找到 **网络 (Networking)**。
3. 在"入站端口规则 (Inbound port rules)"列表上方，点击 **添加入站端口规则 (Add inbound port rule)**。
4. 在右侧弹出的面板中配置：
   - **目标端口范围 (Destination port ranges)**：输入 `18080, 18000`（用英文逗号隔开）。
   - **协议 (Protocol)**：选择 **TCP**。
   - **操作 (Action)**：选择 **允许 (Allow)**。
   - **优先级 (Priority)**：保持默认（如 310）。
   - **名称 (Name)**：随便起，比如 `Allow-SDU-Ports`。
5. 点击 **添加 (Add)**。等待几秒钟，规则生效。

> ⚠️ **注意**：如果不做这一步，一会儿部署完网站，你的浏览器会一直转圈打不开页面。

---

## 四、安装 Docker

在服务器终端（你刚才 SSH 连上的那个黑框框）依次执行以下命令：

```bash
# 1. 更新系统软件
sudo apt update && sudo apt upgrade -y

# 2. 下载 Docker 官方安装脚本并执行
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 3. 将当前用户 (azureuser) 加入 docker 组，这样以后运行 docker 就不需要加 sudo 了
sudo usermod -aG docker $USER
```

👉 **重要操作**：为了让第 3 步生效，你需要**断开连接并重新登录**。
输入 `exit` 回车退出服务器，然后按键盘的 `↑` 上箭头键找回刚才的 `ssh -i ...` 命令，重新连接服务器。

重新连接后，验证安装：
```bash
docker --version
# 输出类似：Docker version 27.x.x, build xxxxxxx 说明成功
```

---

## 五、部署网站

### 1. 下载代码

```bash
# 安装 git 工具
sudo apt install git -y

# 下载项目代码
git clone https://github.com/shadow-opt/SDU_Archive.git

# 进入项目文件夹
cd SDU_Archive
```

### 2. 配置环境变量

项目需要一些密钥才能运行。我们提供了一个模板文件：

```bash
# 复制模板
cp .env.example .env

# 用 nano 编辑器打开
nano .env
```

你**必须修改**的项：

| 变量 | 说明 | 怎么填 |
|------|------|--------|
| `SECRET_KEY` | JWT 加密密钥，保护用户登录安全 | 在终端运行 `openssl rand -hex 32` 生成一串随机字符串，粘贴进去 |
| `ADMIN_PASSWORD` | 管理员密码 | 换一个你自己的强密码 |

可选修改：

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | 你的 OpenAI API Key。填了才有 AI 问答功能；留空网站也能跑，但 AI 相关功能不可用 |
| `ADMIN_EMAIL` | 管理员邮箱，默认 `admin@example.com` |

编辑完成后：按 `Ctrl + O` → 回车（保存） → `Ctrl + X`（退出编辑器）。

### 3. 一键启动

```bash
docker compose up -d --build
```

> ⏳ 首次启动需要下载数据库镜像并编译代码，**大约需要 3~10 分钟**。

当看到四个服务（`db`、`minio`、`api`、`frontend`）都显示 `Started` 时，部署成功！

### 4. 访问你的网站

打开你电脑上的浏览器，在地址栏输入：

```
http://你的服务器公网IP:18080
```

你应该能看到 SDU Archive 的页面了！

---

## 六、域名与 HTTPS（免备案）

用 `IP:端口` 访问不正式也不安全。因为你使用的是 Azure 海外节点，**不需要进行国内的 ICP 备案**，买完域名马上就能用。

### 1. 购买域名
推荐在海外注册商购买（无需实名认证）：
- [Namecheap](https://www.namecheap.com/)
- [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/)

### 2. 解析域名到服务器
在域名注册商的 DNS 管理页面，添加一条 **A 记录**：

| 记录类型 | 主机记录 | 记录值 | TTL |
|---------|---------|--------|-----|
| A | `@` | 你的 Azure 服务器公网 IP | 自动/600 |
| A | `www` | 你的 Azure 服务器公网 IP | 自动/600 |

### 3. 配置 HTTPS（使用 Caddy 反向代理）

为了让网站可以通过 `https://yoursite.com`（不带端口号）访问，并自动加上安全锁 🔒，我们使用最简单的 Caddy。

在服务器终端执行：

```bash
# 安装 Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudflare.com/cloudflare-main.gpg' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudflare.com/caddy/stable/deb/debian/setup.deb.sh' | sudo bash
sudo apt install caddy -y

# 编辑配置文件
sudo nano /etc/caddy/Caddyfile
```

将里面的内容全部删掉，替换为以下两行（把 `yoursite.com` 换成你的真实域名）：

```
yoursite.com {
    reverse_proxy localhost:18080
}
```

保存退出（`Ctrl+O`, 回车, `Ctrl+X`），然后重启 Caddy：

```bash
sudo systemctl restart caddy
```

等待约 30 秒，打开浏览器访问 `https://yoursite.com`，大功告成！🎉
