# Personal Deployment Guide (UGREEN NAS)

## Overview

本文档描述如何将自己 fork 开发的版本部署到绿联 NAS 上，不依赖上游作者打 tag 发版，完全自主控制。

### Architecture

```
Your Mac (开发)                    GitHub (CI/CD)                    UGREEN NAS (部署)
─────────────────────────────────────────────────────────────────────────────────────
git push                    →    GitHub Actions 自动构建     →     绿联 Docker 拉取
                                   │                                      │
                                   ├── glean-backend (amd64+arm64)        │
                                   ├── glean-worker  (amd64+arm64)        │
                                   ├── glean-web     (amd64+arm64)        │
                                   └── glean-admin   (amd64+arm64)        │
                                   │                                      │
                                   ▼                                      ▼
ghcr.io/gotoboy/glean-*:branch/sha/latest ← docker-compose.yml
```

---

## Step 1: Fork 准备工作（仅首次）

### 1.1 启用 GitHub Actions

你的 fork 默认可能禁用了 workflows：

1. 打开 `https://github.com/GoToBoy/glean`
2. 点 **Actions** tab
3. 点 **I understand my workflows, go ahead and enable them**

### 1.2 设置 GHCR Packages 为公开

构建完成后，镜像默认是 private，绿联 NAS 拉不到：

1. 打开 `https://github.com/GoToBoy?tab=packages`
2. 分别点击 `glean-backend`、`glean-web`、`glean-admin`
3. 每个 package → **Package settings** → **Danger Zone** → **Change visibility** → **Public**

> 首次构建后才会出现 packages，所以先完成 Step 2 再来做这一步。

---

## Step 2: 触发构建

### 方式 A：普通 push（推荐）

把代码提交并推送到 GitHub，`release.yml` 会自动构建并推送四个镜像：

```bash
git push origin personal-main
```

构建成功后会生成这些镜像 tag：

| 推送类型 | 镜像 Tag | 示例 |
|----------|----------|------|
| `main` / `personal-main` push | 分支名 | `personal-main` |
| `main` / `personal-main` push | 短 commit SHA | `sha-1a2b3c4d5e6f` |
| 默认分支 push | `latest` | `latest` |

部署到 NAS 时，优先使用 `sha-...` 这种不可变 tag；如果你总是部署默认分支，也可以使用 `latest`。

### 方式 B：GitHub Release / Tag（可选）

1. 打开 `https://github.com/GoToBoy/glean/releases`
2. 点 **Draft a new release**
3. **Choose a tag** → 输入 `v0.1.0-alpha.1` → 选 **Create new tag: v0.1.0-alpha.1 on publish**
4. **Target** 选 `main` 或 `personal-main`
5. Title 随意填写
6. 点 **Publish release**

### 方式 C：命令行打 tag（可选）

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

### Tag 命名规则

| Tag 格式 | 触发的 Workflow | 镜像 Tag | 更新 latest? |
|----------|----------------|----------|-------------|
| `v0.1.0-alpha.1` | `pre-release.yml` | `0.1.0-alpha.1` | **否** |
| `v0.1.0-beta.1` | `pre-release.yml` | `0.1.0-beta.1` | **否** |
| `v0.1.0-rc.1` | `pre-release.yml` | `0.1.0-rc.1` | **否** |
| `v0.1.0` | `release.yml` | `0.1.0` + `latest` | **是** |

**普通开发不再需要打 tag。** tag 仍然适合正式版本或需要 GitHub Release 页面记录的版本。

### 验证构建状态

打开 `https://github.com/GoToBoy/glean/actions`，等待所有 job 显示绿色 ✓（约 5-10 分钟）。

构建成功后镜像地址为：
```
ghcr.io/gotoboy/glean-backend:sha-1a2b3c4d5e6f
ghcr.io/gotoboy/glean-worker:sha-1a2b3c4d5e6f
ghcr.io/gotoboy/glean-web:sha-1a2b3c4d5e6f
ghcr.io/gotoboy/glean-admin:sha-1a2b3c4d5e6f
```

> **注意**：GitHub Release 页面的 "Set as a pre-release" 勾选框只是 UI 标签，不影响镜像构建和拉取。普通 push 走 `release.yml` 的分支构建；tag push 由 **tag 名称格式** 决定走 `release.yml` 还是 `pre-release.yml`。

---

## Step 3: 绿联 NAS 部署

### 3.1 Docker Compose 内容

在绿联 Docker 管理器中创建新的 Compose 项目，粘贴项目根目录下的 `docker-compose.personal.yml` 文件内容。

**关键修改**：将文件中四处 `${IMAGE_TAG:-latest}` 替换为你的实际版本号：

```yaml
# 替换前
image: ghcr.io/gotoboy/glean-backend:${IMAGE_TAG:-latest}

# 替换后
image: ghcr.io/gotoboy/glean-backend:sha-1a2b3c4d5e6f
```

需要替换的四个位置：
- `backend` service 的 `image`
- `worker` service 的 `image`
- `admin` service 的 `image`
- `web` service 的 `image`

### 3.2 环境变量配置

如果绿联支持 `.env` 文件或环境变量配置，可以设置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `POSTGRES_PASSWORD` | 数据库密码 | `glean` |
| `SECRET_KEY` | JWT 签名密钥 | `change-me-...` |
| `WEB_PORT` | Web 访问端口 | `80` |
| `ADMIN_PORT` | Admin 面板端口 | `3001` |
| `CREATE_ADMIN` | 自动创建管理员 | `true` |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `Admin123!` |

**生产环境务必修改 `SECRET_KEY` 和 `ADMIN_PASSWORD`。**

### 3.3 启动

在绿联 Docker Compose 编辑器中保存并启动项目。首次启动会自动：
1. 拉取所有镜像
2. 创建数据库
3. 运行数据库迁移
4. 创建管理员账号
5. 使用兼容 Python 3.14 的 worker 启动包装脚本启动 `arq`

---

## Step 4: 日常更新流程

```
1. 本地改代码
       │
       ▼
2. git push origin personal-main
       │
       ▼
3. 等 GitHub Actions 构建完成（约 5-10 分钟）
       │
       ▼
4. 绿联 NAS：停止 Compose 项目
       │
       ▼
5. 修改 yml 中镜像 tag：sha-旧提交 → sha-新提交
       │
       ▼
6. 重新启动 Compose 项目（自动拉取新镜像）
```

如果你想调整 worker 的自动抓取频率，可以在 NAS 的 Compose / container yaml 里给 `worker` 增加或修改：

```yaml
environment:
  FEED_REFRESH_INTERVAL_MINUTES: 720
  WORKER_TIMEZONE: Asia/Shanghai
```

默认值是 `720`，也就是 12 小时。这个值同时影响：

- worker 定时抓取 cron
- 抓取成功后 `next_fetch_at` 的默认推进间隔

`WORKER_TIMEZONE` 会决定 worker cron 和“午夜补跑”按哪个时区计算。部署在国内 NAS 上时，建议显式设置为 `Asia/Shanghai`，不要依赖容器默认时区。

注意：

- 命名时区如 `Asia/Shanghai` 依赖 worker 镜像内可用的 IANA 时区数据
- 如果镜像里缺少系统时区库或 Python `tzdata`，worker 可能在启动时直接报 `ZoneInfoNotFoundError`
- 部署自定义 tag 时，确认 worker 镜像包含 `tzdata` 支持和时区不可用时的 `UTC` 回退逻辑

---

## Rollback: 回滚到官方版本

将 yml 中的镜像源改回官方：

```yaml
# 个人版本
image: ghcr.io/gotoboy/glean-backend:0.1.0-alpha.1

# 官方版本
image: ghcr.io/leslieleung/glean-backend:latest
```

其中 `worker` 需要对应改为：

```yaml
# 个人版本
image: ghcr.io/gotoboy/glean-worker:0.1.0-alpha.1

# 官方版本
image: ghcr.io/leslieleung/glean-backend:latest
```

四处都改回来，重启即可。数据库 volume 不受影响，数据不丢失。

---

## FAQ

### Q: 构建失败怎么办？

检查 GitHub Actions 日志：`https://github.com/GoToBoy/glean/actions`，点击失败的 run 查看具体错误。

### Q: NAS 拉取镜像报 "unauthorized"？

Package 还是 private。去 `https://github.com/GoToBoy?tab=packages` 把每个 package 设为 Public。

### Q: 数据库迁移失败？

Backend 容器启动时自动运行迁移（`RUN_MIGRATIONS=true`）。如果有冲突，检查 backend 容器日志。

### Q: PR 会包含这个 personal yml 文件吗？

不会。`docker-compose.personal.yml` 已添加到 `.gitignore`，不会出现在 git 记录中。

### Q: 如何同步上游作者的最新代码？

```bash
git remote add upstream https://github.com/leslieleung/glean.git  # 仅首次
git fetch upstream
git rebase upstream/main
git push origin personal-main --force-with-lease
# push 后会自动触发构建
```

---

## Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `docker-compose.personal.yml` | 项目根目录 | 完整的个人部署 Compose 文件（已 gitignore） |
| `docker-compose.yml` | 项目根目录 | 官方部署文件（不要修改） |
| `.github/workflows/pre-release.yml` | CI | alpha/beta/rc tag 触发的构建流程 |
| `.github/workflows/release.yml` | CI | `main` / `personal-main` push 自动构建镜像；正式版 tag 创建 GitHub Release |
