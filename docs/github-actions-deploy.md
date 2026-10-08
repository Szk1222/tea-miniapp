# GitHub Actions 部署

本文件说明 `.github/workflows/ci-deploy.yml` 的配置与使用。流水线把「校验 → 出镜像 → 传小程序」
串成一条链，**校验不过就不会发布**（靠 `needs` 依赖图保证，不是靠约定）。

---

## 一、流水线结构

```
push / PR / 手动触发
        │
        ▼
┌───────────────────────────────────────────────┐
│ verify  校验闸门（所有情况都跑）                │
│   · JS 语法检查（node --check）                │
│   · JSON 配置校验                             │
│   · 密钥泄漏防线（.env 是否被追踪 / 明文扫描）   │
│   · 服务端回归测试（server && npm test）        │
└───────────────────────────────────────────────┘
        │ needs: verify
        ├──────────────────────────────┬──────────────────────────────┐
        ▼                              ▼                              ▼
┌────────────────────┐   ┌──────────────────────────┐   ┌────────────────────────┐
│ image              │   │ miniprogram              │   │                        │
│ 构建服务端镜像      │   │ 上传小程序体验版          │   │  （PR 时不跑 image /    │
│ 推送到 GHCR        │   │ 仅 tag v* 或手动勾选时跑  │   │    miniprogram）        │
│ 每次都跑（非 PR）   │   │                          │   │                        │
└────────────────────┘   └──────────────────────────┘   └────────────────────────┘
```

| 触发方式 | verify | image | miniprogram |
|---|---|---|---|
| push 到 `master` / `main` | ✓ | ✓ | ✗ |
| push tag `v*` | ✓ | ✓ | ✓ |
| Pull Request | ✓ | ✗ | ✗ |
| 手动触发（勾选上传） | ✓ | ✓ | ✓ |

> push 带 `paths` 过滤：只改了 `.workbuddy/`、`docs/` 这类文件时不会触发流水线，避免无意义的构建。

---

## 二、一次性配置

### 2.1 让服务器能拉取镜像（可选，但部署要用）

GHCR 里的镜像默认继承仓库可见性 = **私有**，服务器拉取需要登录。
建议单独建一个**只勾 `read:packages`** 的 fine-grained PAT，别复用有写权限的令牌：

```bash
# 在服务器上执行一次
echo "<只有 read:packages 权限的 PAT>" | docker login ghcr.io -u Szk1222 --password-stdin
```

> 也可以到 GitHub 的 **Packages → chalifang-agent → Settings → Change visibility** 把镜像设为公开，
> 服务器就不用登录。**但不建议**：镜像里含服务端源码与知识库内容（`data/`），那是你的核心资产。

### 2.2 配置小程序上传密钥（上传体验版必需）

**第一步：在微信公众平台生成密钥**

公众平台 → **开发管理 → 开发设置 → 小程序代码上传 → 生成密钥** → 下载得到
`private.wxda7a648bda4e9cfa.key`（**只能下载一次，丢了只能重新生成**）。

**第二步：转成 base64 单行文本**

```bash
# macOS / Linux
base64 -w0 private.wxda7a648bda4e9cfa.key

# macOS（老版本 base64 不认 -w）
base64 -i private.wxda7a648bda4e9cfa.key

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("private.wxda7a648bda4e9cfa.key"))
```

**第三步：写入仓库 Secret**

仓库 → **Settings → Secrets and variables → Actions → New repository secret**

| 名称 | 值 |
|---|---|
| `MINIPROGRAM_PRIVATE_KEY` | 上一步输出的 base64 单行文本 |

> ⚠️ **不要**把 `.key` 文件本身提交进仓库。密钥只在 runner 的临时目录出现，工作流结束即销毁。

### 2.3 ⚠️ IP 白名单（最容易卡住的一步）

公众平台的「小程序代码上传」密钥可以开启 **IP 白名单**。而 GitHub 托管 runner 的出口 IP 是
**动态的**（Azure 地址段，每周都在变），**开了白名单必然上传失败**，报错形如
`invalid ip, not in whitelist`。

两条路：

| 方案 | 做法 | 代价 |
|---|---|---|
| **关闭白名单**（推荐） | 密钥页面关掉 IP 白名单 | 密钥泄露即可被他人上传；但密钥只存在 GitHub Secret 里，风险可控 |
| **自托管 runner** | 给仓库挂一个固定 IP 的 runner，把该 IP 填进白名单 | 需要一台常驻机器 |

流水线的上传脚本已内置这条错误的识别，失败时会直接在日志里给出上述提示。

---

## 三、怎么触发

```bash
# 1. 常规提交：跑校验 + 出镜像
git push origin master

# 2. 发版：打 tag 会额外上传小程序体验版（版本号取 tag，去掉前缀 v）
git tag v1.0.1
git push origin v1.0.1

# 3. 手动触发：GitHub → Actions → CI / 部署 → Run workflow
#    可勾选 upload_miniprogram，并填写 version / desc
```

上传成功后，到公众平台 **版本管理 → 开发版本** 即可看到，来源标注为 `CI`（机器人 1）。
版本号只作为标识，**不会自动提交审核** —— 审核仍需你在后台手动点。

---

## 四、在服务器上部署

`.env` 不在版本库里（含方舟 Key），**需要你在服务器上单独创建**：

```bash
mkdir -p /srv/chalifang && cd /srv/chalifang
# 从 server/.env.example 复制一份并填入真实值
vi server.env
```

启动（只监听本机，由 Nginx 反代，不要把 8787 直接暴露到公网）：

```bash
docker pull ghcr.io/szk1222/chalifang-agent:latest

docker run -d --name chalifang-agent \
  --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  --env-file ./server.env \
  -v chalifang-storage:/app/server/storage \
  -v chalifang-cache:/app/server/.cache \
  ghcr.io/szk1222/chalifang-agent:latest
```

或用 compose（在 `server/docker-compose.yml` 里把 `build:` 注释掉、改用 `image:`）：

```yaml
services:
  agent:
    image: ghcr.io/szk1222/chalifang-agent:latest
    # build:
    #   context: ..
    #   dockerfile: server/Dockerfile
```

更新版本：

```bash
docker pull ghcr.io/szk1222/chalifang-agent:latest
docker rm -f chalifang-agent && docker run ...   # 或用 docker compose up -d
```

> **单实例约束**：内容库与热更新是「进程内 + 本地磁盘」，**不要 `--scale`**，
> 否则多个实例各读各的，内容会不一致。
>
> **持久化**：`chalifang-storage` 卷不能省 —— 否则后台改过的内容与审计日志会随容器重建清空。

---

## 五、本仓库的两个特有坑

### 5.1 仓库名是 `-`，不能直接当镜像名

Docker 仓库名的规则是「分隔符两侧必须都有字母数字」，单独一个 `-` **不合法**。
所以镜像名固定用 `chalifang-agent`（不是 `<owner>/<repo>`），并把 owner 做了小写化
（GHCR 要求路径全小写，而账号是 `Szk1222`）。

最终镜像地址：**`ghcr.io/szk1222/chalifang-agent`**

### 5.2 `server/` 与小程序同仓，密钥必须挡住

仓库里同时有小程序端与服务端，而 `server/.env` 含方舟 API Key（额度记在开发者账号上，
泄露即被刷真实资费）。因此：

- `.gitignore` / `.dockerignore` 均已排除 `.env`；
- `verify` 作业里加了一道**独立的密钥泄漏防线**，`.env` 一旦被 `git add` 就会让流水线红掉；
- 小程序上传时通过 `ignores` 排除 `server/**`、`docs/**`、`.github/**`，避免服务端源码进包。

---

## 六、常见失败排查

| 现象 | 原因 | 处理 |
|---|---|---|
| `invalid ip, not in whitelist` | 上传密钥开了 IP 白名单 | 关闭白名单，或改自托管 runner |
| `未配置 Secrets.MINIPROGRAM_PRIVATE_KEY` | Secret 没加或名字拼错 | 按 §2.2 添加 |
| `密钥解码为空` | Secret 内容不是 base64，或带了换行/说明文字 | 只粘贴 base64 单行文本 |
| `✗ 未提供版本号` | 手动触发没填 version，且不是 tag 推送 | 打 tag 或填 version |
| GHCR 推送 403 | 工作流缺 `packages: write` | 已在该 job 的 `permissions` 中声明；若仍失败，检查仓库 Settings → Actions 的 Workflow permissions |
| 服务器 `docker pull` 401 | 私有镜像未登录 | 按 §2.1 执行 `docker login ghcr.io` |
| 流水线完全不触发 | push 只改了 `paths` 未覆盖的文件 | 检查改动路径；或在 Actions 页手动 Run workflow |
