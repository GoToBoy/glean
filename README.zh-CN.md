# Glean 拾灵

**[English](./README.md)** | **[中文](./README.zh-CN.md)**

> [!IMPORTANT]
> 本 README 描述的是此 fork 的主分支 `personal-main`，而不是上游 `main`。
> 与 `main` 的差异概览请见 [docs/README.main-vs-feature.zh-CN.md](./docs/README.main-vs-feature.zh-CN.md)。

> [!NOTE]
> 欢迎加入我们的 [Discord](https://discord.gg/KMKC4sRVSJ) 获取更新和支持。
> 项目仍在持续开发中。

Glean 是一个面向高密度阅读场景的自托管 RSS 阅读器与个人知识管理工具。

![Glean](asset/Screenshot.png)

## 当前 Fork 包含的能力

- RSS/Atom 订阅、嵌套文件夹、OPML 导入导出、订阅刷新状态追踪。
- RSSHub 管理员配置、自动兜底转换，以及手动 RSSHub 路径订阅。
- Discover 发现流程，用于寻找新信源并直接转化为订阅。
- 沉浸式双语阅读、持久化翻译缓存，以及多翻译提供方支持。
- 收藏、标签、稍后阅读、文件夹整理，以及桌面/移动端阅读流程优化。
- 管理后台支持订阅批量操作、错误重试、状态轮询和用户管理。
- 向量存储已迁移到 PostgreSQL + `pgvector`，当前 fork 不再依赖 Milvus。
- 对纯 HTTP 无法抓取正文的 RSS 站点，提供基于 Playwright 的 worker 浏览器回退抓取。

## 为什么此 Fork 使用独立主分支

这个 fork 的迭代速度和方向与上游不同，不再以等待上游合并作为发布节奏。
仓库的主要发布分支预期为 `personal-main`。

相对上游 `main`，这个 fork 目前主要新增：

- 默认使用 `pgvector`，不再依赖单独的 Milvus 服务。
- 完整翻译链路与沉浸式双语阅读。
- Discover + RSSHub 自动转换与回退订阅流程。
- 更稳健的 feed 抓取、重试与错误可观测性。
- 更完整的管理端批量操作与部署运维增强。
- 独立 `glean-worker` 镜像，并对受挑战页保护的 RSS 正文抓取提供 Playwright 浏览器回退。

## 快速开始

### Docker Compose

```bash
# 从当前分支下载 compose 文件
curl -fsSL https://raw.githubusercontent.com/GoToBoy/glean/personal-main/docker-compose.yml -o docker-compose.yml

# 可选：下载当前分支的示例环境变量文件
curl -fsSL https://raw.githubusercontent.com/GoToBoy/glean/personal-main/.env.example -o .env

# 启动 Glean
docker compose up -d

# 可选：启用本地 MTranServer 翻译服务
docker compose --profile mtran up -d
```

访问地址：

- Web 应用：`http://localhost`
- 管理后台：`http://localhost:3001`
- API 健康检查：`http://localhost:8000/api/health`

### 默认管理员账号

默认会自动创建管理员账号：

- 用户名：`admin`
- 密码：`Admin123!`

请在真实部署前修改该密码。

## 部署说明

当前 fork 使用单个 PostgreSQL 实例承载 `pgvector` 扩展，不再需要单独的 Milvus 服务。

默认服务包括：

- `postgres` - 带 `pgvector` 的 PostgreSQL 16
- `redis` - 队列与缓存
- `backend` - FastAPI API 服务
- `worker` - 负责抓取、浏览器正文回退、清理、翻译、向量任务的后台 worker
- `web` - 主阅读器前端
- `admin` - 管理后台
- `mtranserver` - 可选翻译服务，通过 `--profile mtran` 启用

预构建镜像位于 GHCR：

- `ghcr.io/leslieleung/glean-backend:latest`
- `ghcr.io/leslieleung/glean-web:latest`
- `ghcr.io/leslieleung/glean-admin:latest`

支持架构：`linux/amd64`、`linux/arm64`

## 配置项

重要环境变量：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `SECRET_KEY` | JWT 签名密钥 | `change-me-in-production-use-a-long-random-string` |
| `POSTGRES_PASSWORD` | PostgreSQL 密码 | `glean` |
| `ADMIN_USERNAME` | 默认管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 默认管理员密码 | `Admin123!` |
| `CREATE_ADMIN` | 启动时自动创建管理员 | `true` |
| `WEB_PORT` | Web 端口 | `80` |
| `ADMIN_PORT` | 管理后台端口 | `3001` |
| `IMAGE_TAG` | Docker 镜像标签 | `latest` |
| `MTRAN_SERVER_URL` | backend/worker 使用的翻译服务地址 | `http://mtranserver:5001` |
| `WORKER_JOB_TIMEOUT_SECONDS` | 长任务 worker 超时 | `1800` |
| `WORKER_MAX_JOBS` | worker 的最大并发 job 数 | `4` |
| `FEED_REFRESH_INTERVAL_MINUTES` | 定时抓取间隔，以及默认的 `next_fetch_at` 推进延迟 | `720` |
| `WORKER_MEMORY_LIMIT` | worker 容器的 Docker 内存硬上限 | `2g` |
| `WORKER_MEMORY_RESERVATION` | worker 容器的 Docker 内存预留 | `1g` |
| `BROWSER_EXTRACTION_MAX_CONCURRENCY` | Playwright 正文回退的最大并发数 | `1` |
| `BROWSER_EXTRACTION_TIMEOUT_SECONDS` | 单页 Playwright 提取超时秒数 | `20` |

完整配置见 [.env.example](./.env.example)。

Docker 部署性能说明：

- 默认配置已经把 `glean-worker` 收紧为更保守的运行模式：`WORKER_MAX_JOBS=4`、`BROWSER_EXTRACTION_MAX_CONCURRENCY=1`，并给 worker 容器设置了 `2g` 内存上限。
- 定时抓取现在默认每 12 小时一次，对应 `FEED_REFRESH_INTERVAL_MINUTES=720`；如果你希望更快或更慢，可以在 Compose 环境变量里覆盖。
- 后续如果继续增加抓取、回填、翻译或向量任务，建议把并发和内存预算作为功能设计的一部分，一起评估和落配置。

## 当前能力重点

### 阅读器与翻译

- 自动将非中文内容翻译成中文。
- 基于句级/段级规则的双语渲染，并带持久化缓存。
- 支持多翻译提供方，包括 MTranServer 以及远端翻译服务配置。
- 改进了移动端阅读器导航、列表恢复和重复翻译控制。

### 订阅与发现

- 支持通过订阅地址、网站地址或 RSSHub 路径添加订阅。
- 当源地址不能直接订阅时，可自动回退到 RSSHub。
- 提供 Discover 发现页、候选源反馈和订阅转化链路。
- 支持抓取尝试/成功时间展示，以及更清晰的错误处理。

### 管理与运维

- 管理后台支持单条刷新、全部刷新、错误重试等操作。
- 订阅源列表支持批量管理。
- 包含用户管理、密码重置、订阅导入等后台能力。
- 面向 Docker 部署，提供当前分支 compose 文件和可选 MTran profile。

## 技术栈

### 后端

- Python 3.11+ / FastAPI / SQLAlchemy 2.0
- PostgreSQL + `pgvector`
- Redis + arq worker 队列

### 前端

- React 18 / TypeScript / Vite
- Tailwind CSS / Zustand / TanStack Query

## 开发

完整说明见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

快速开始：

```bash
git clone https://github.com/GoToBoy/glean.git
cd glean
npm install

# 启动基础设施
make up

# 执行数据库迁移
make db-upgrade

# 启动全部开发服务
make dev-all
```

开发环境地址：

- Web：`http://localhost:3000`
- Admin：`http://localhost:3001`
- API 文档：`http://localhost:8000/api/docs`

## 分支相关文档

- [docs/README.main-vs-feature.zh-CN.md](./docs/README.main-vs-feature.zh-CN.md) - `personal-main` 相对上游 `main` 的能力差异概览
- [docs/feature-change-log.md](./docs/feature-change-log.md) - 功能级变更记录
- [docs/rss-browser-extraction-plan.md](./docs/rss-browser-extraction-plan.md) - RSS 正文浏览器回退抓取方案
- [DEVELOPMENT.md](./DEVELOPMENT.md) - 本地开发指南

## 参与贡献

欢迎贡献，建议先阅读 [DEVELOPMENT.md](./DEVELOPMENT.md)，然后：

1. Fork 仓库。
2. 创建分支。
3. 运行测试、lint 和类型检查。
4. 提交 Pull Request。

## 许可证

本项目采用 [AGPL-3.0](./LICENSE) 许可证。
