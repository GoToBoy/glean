# Glean 拾灵

**[English](./README.md)** | **[中文](./README.zh-CN.md)**

一个自托管的 RSS 阅读器和个人知识管理工具。

> **Glean**（拾灵）帮助重度信息消费者通过智能 RSS 聚合高效管理阅读。

## 功能特性

- 📰 **RSS 订阅** - 订阅和管理 RSS/Atom 源
- 📚 **智能阅读** - 简洁的阅读体验，支持内容过滤
- 🔖 **稍后阅读** - 保存文章以便稍后阅读
- 🔧 **后台同步** - 每 15 分钟自动更新订阅源
- 🔒 **自托管** - Docker 部署，完全掌控数据
- 🎨 **现代界面** - 美观、响应式的用户界面

## 快速开始

### 一键部署

```bash
# 下载并启动 Glean
curl -fsSL https://raw.githubusercontent.com/LesliLeung/glean/main/docker-compose.yml -o docker-compose.yml
docker compose up -d

# 访问 http://localhost
```

就这么简单！打开 http://localhost 即可开始使用 Glean。

### 带管理后台部署

如需额外的管理功能（用户管理、统计数据）：

```bash
# 下载完整部署配置
curl -fsSL https://raw.githubusercontent.com/LesliLeung/glean/main/docker-compose.full.yml -o docker-compose.yml

# 首次启动时创建管理员账号
CREATE_ADMIN=true docker compose up -d

# 查看日志获取管理员凭据（请妥善保存！）
docker compose logs backend | grep -A5 "Admin Account Created"

# 访问：
# - Web 应用: http://localhost
# - 管理后台: http://localhost:3001
```

### 手动创建管理员账号

```bash
# 生成随机密码
docker exec -it glean-backend /app/scripts/create-admin-docker.sh

# 或指定凭据
docker exec -it glean-backend /app/scripts/create-admin-docker.sh myusername MySecurePass123!
```

## 配置说明

复制 `.env.example` 为 `.env` 并自定义：

```bash
curl -fsSL https://raw.githubusercontent.com/LesliLeung/glean/main/.env.example -o .env
```

主要配置项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SECRET_KEY` | JWT 签名密钥 | **生产环境必须修改！** |
| `POSTGRES_PASSWORD` | 数据库密码 | `glean` |
| `WEB_PORT` | Web 界面端口 | `80` |
| `ADMIN_PORT` | 管理后台端口 | `3001` |

## Docker 镜像

预构建镜像托管在 GitHub Container Registry：

- `ghcr.io/leslieleung/glean-backend:latest` - API 服务器 & Worker
- `ghcr.io/leslieleung/glean-web:latest` - Web 前端
- `ghcr.io/leslieleung/glean-admin:latest` - 管理后台

支持架构：`linux/amd64`、`linux/arm64`

## 部署选项

| 部署方式 | 说明 | 命令 |
|----------|------|------|
| **精简版** | 仅 Web 应用（无管理后台） | `docker compose up -d` |
| **完整版** | Web + 管理后台 | `docker compose -f docker-compose.full.yml up -d` |

## 技术栈

**后端：**
- Python 3.11+ / FastAPI / SQLAlchemy 2.0
- PostgreSQL / Redis / arq（任务队列）

**前端：**
- React 18 / TypeScript / Vite
- Tailwind CSS / Zustand / TanStack Query

## 开发指南

完整的开发环境配置请参阅 **[DEVELOPMENT.md](./DEVELOPMENT.md)**。

快速开始：

```bash
# 克隆并配置
git clone https://github.com/LesliLeung/glean.git
cd glean
npm install

# 启动基础设施
make up

# 启动所有服务
make dev-all

# 访问：
# - Web: http://localhost:3000
# - 管理后台: http://localhost:3001
# - API 文档: http://localhost:8000/api/docs
```

## 文档

- **[开发指南](./DEVELOPMENT.md)** - 搭建开发环境
- **[部署指南](./deploy/README.md)** - 生产环境部署详情
- **[架构设计](./docs/glean-architecture.md)** - 系统架构概览
- **[产品需求](./docs/glean-prd-v1.2.md)** - 功能规格说明

## 参与贡献

欢迎贡献！请先阅读 [开发指南](./DEVELOPMENT.md)。

1. Fork 本仓库
2. 创建功能分支
3. 提交修改
4. 运行测试和代码检查
5. 提交 Pull Request

## 许可证

本项目采用 **AGPL-3.0 许可证** - 详见 [LICENSE](LICENSE) 文件。

