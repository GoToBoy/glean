# Glean 分支对比 README（`main` vs `personal-main`）

## 1. 对比范围

- 对比分支：`main...personal-main`
- 基线时间：`2026-03-10`（已基于最新本地 `main`，且 `main == origin/main`）
- 当前分支领先：`102` commits（`main` 落后 `0`）
- 代码差异规模：`186 files changed`，`+17148 / -3589`
- 对比方式：`git diff main...personal-main`

> 本文档聚焦两件事：  
> 1) 这个 feature 分支新增了哪些能力；  
> 2) 在原有功能上的优化点（稳定性、性能、体验、可运维性）。

---

## 2. 相比 `main` 的核心功能新增

### 2.1 向量能力从 Milvus 迁移到 pgvector

- 引入 `pgvector` 客户端与数据库迁移，向量数据落在 PostgreSQL 体系内。
- 默认编排改为 `pgvector/pgvector:pg16`，减少独立向量数据库运维成本。
- 向量校验与嵌入/偏好服务适配 pgvector 路径。

关键位置：
- `backend/packages/vector/glean_vector/clients/pgvector_client.py`
- `backend/packages/database/glean_database/migrations/versions/a1b2c3d4e5f6_add_pgvector_tables.py`
- `docker-compose.yml`

### 2.2 翻译能力升级（端到端）

- 新增多翻译提供方（含 MTranServer）与可配置策略。
- 新增段落/句级翻译链路，支持沉浸式双语阅读。
- 新增翻译相关 worker 任务与持久化表结构。

关键位置：
- `backend/packages/core/glean_core/services/translation_service.py`
- `backend/apps/worker/glean_worker/tasks/translation.py`
- `backend/packages/database/glean_database/models/entry_translation.py`
- `frontend/apps/web/src/hooks/useViewportTranslation.ts`

### 2.3 Discover 与 RSSHub 自动兜底

- 新增 Discover 服务、路由与前端页面。
- 引入 RSSHub 规则与自动回退/转换能力。
- 支持用户维度 API Key（如 Tavily）配置能力。

关键位置：
- `backend/packages/core/glean_core/services/discovery_service.py`
- `backend/apps/api/glean_api/routers/discover.py`
- `frontend/apps/web/src/pages/DiscoverPage.tsx`

### 2.4 行为信号与排序相关能力补充

- 增加隐式反馈事件相关表结构与前端触发点。
- 为列表交互与排序策略优化提供数据基础（同时保留后续回滚/调整空间）。

关键位置：
- `backend/packages/database/glean_database/migrations/versions/c9f8d4a7b112_add_implicit_feedback_event_tables.py`
- `frontend/apps/web/src/hooks/useEndOfArticleFeedbackPrompt.ts`

---

## 3. 在原有功能上的优化（重点）

### 3.1 阅读与列表体验优化

- 阅读器结构重构（桌面/移动拆分壳层），提升可维护性。
- 列表虚拟化、滚动锚点与恢复策略优化，减少跳动和误定位。
- 侧边栏、筛选与交互路径精简，降低重复请求和 UI 抖动。

关键位置：
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- `frontend/apps/web/src/pages/reader/desktop/ReaderDesktopShell.tsx`
- `frontend/apps/web/src/pages/reader/mobile/ReaderMobileShell.tsx`

### 3.2 订阅抓取稳定性增强

- 抓取失败状态与重试行为更清晰（包含 429 等场景处理）。
- 入库改为更强幂等路径（重复 guid/重复 entry 的处理）。
- 增加抓取尝试/成功时间字段，便于运维排障与可观测。

关键位置：
- `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- `backend/packages/database/glean_database/migrations/versions/d1e2f3a4b5c6_add_feed_fetch_attempt_success_timestamps.py`
- `backend/packages/database/glean_database/migrations/versions/e7b9c2d4f1a8_make_feed_fetch_error_message_text.py`

### 3.3 管理台与运维优化

- 管理台新增批量操作、错误重试、状态轮询等能力。
- Dockerfile、静态资源预压缩、Nginx 配置优化，提升部署性能。
- 新增 Cloudflare Tunnel / personal compose 等部署方案文档与编排。

关键位置：
- `frontend/apps/admin/src/pages/FeedsPage.tsx`
- `frontend/apps/web/scripts/precompress-assets.mjs`
- `docs/cloudflare-tunnel-optimization.md`
- `docker-compose.personal.yml`

### 3.4 测试覆盖增强

- 新增 API、worker、core、frontend hooks/store 等多层测试。
- 重点覆盖翻译、Discover、订阅抓取、阅读器交互等高变更模块。

### 3.5 与最新 `main` 的边界说明

- OIDC 已在最新 `main` 中存在，因此不计入本分支“相对 main 的新增”。
- 本文档仅统计 `main...personal-main` 真实剩余差异。

---

## 4. 兼容性与迁移注意事项

### 4.1 从 `main` 切换到该 feature 分支时

1. 执行数据库迁移（重点关注翻译、pgvector、discover、隐式反馈相关新表）。
2. 检查 `.env` 新变量：
   - 翻译相关：`MTRAN_*` / 翻译 provider 配置
   - Cloudflare Tunnel（可选）：`CLOUDFLARE_*`
3. 若沿用旧部署说明，需更新“向量存储依赖”为 pgvector 方案。
4. 建议同步更新 compose 文件（`docker-compose.yml` / `docker-compose.lite.yml`）。

### 4.2 回滚风险点

- 数据库 schema 扩展较多，直接回滚到旧迁移链成本高。
- 与翻译、发现、向量相关的前后端接口已联动，建议整体回滚而非局部摘除。

---

## 5. 建议验收清单（最小）

1. 认证：本地账号登录（并确认与主分支认证流程一致）。
2. 订阅：添加 feed、触发刷新、失败重试、错误状态清理。
3. 阅读：列表切换、详情打开、移动端来回切页、滚动恢复。
4. 翻译：列表与详情触发翻译、缓存命中、异常降级。
5. Discover：发现页搜索、候选源反馈、订阅转化链路可用。
6. 向量：pgvector 扩展可用，嵌入写入与召回正常。

---

## 6. 总结

与 `main` 相比，这个分支不是单点特性补丁，而是一次“能力扩展 + 旧功能系统性优化”：
- 能力扩展：pgvector、翻译体系、Discover/RSSHub、行为信号埋点。
- 功能优化：阅读器体验、抓取稳定性、运维部署、测试覆盖。
- 工程结果：在保留原有 RSS/阅读主流程的前提下，提升了可扩展性、可维护性与上线可操作性。
