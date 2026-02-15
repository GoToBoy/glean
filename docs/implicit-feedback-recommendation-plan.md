# Implicit Feedback Recommendation Plan

Last updated: 2026-02-16

## 1. 背景与目标

当前 Smart View 主要依赖显式反馈（like/dislike/bookmark）与向量相似度。  
目标是支持“用户不主动点赞”场景，通过阅读行为（停留时长、完成度、回看、快跳）提升推荐质量。

核心思路：
- 保持现有“候选召回 + 重排”架构不变
- 先引入低风险规则分（`implicit_engagement_boost`）
- 再升级多目标排序（完成率、有效阅读、归一化停留）

## 2. 范围（MVP）

MVP 只做以下内容：
- 采集阅读行为事件（含幂等 ID）
- 生成隐式反馈标签（T+1 批处理）
- 在现有 `ScoreService` / `SimpleScoreService` 上增加 `implicit_engagement_boost`
- 开启灰度开关，支持快速回滚

不在 MVP 范围：
- 全量模型重训练平台
- 实时流式特征平台
- 复杂 bandit 在线探索

## 3. 分阶段计划

## Phase 0：基线验证（2-3 天）

目标：先用现有数据验证方向，降低“先埋点后发现无收益”风险。

- 基于现有 `UserEntry` 信号构造弱隐式特征：
  - `read_with_dwell_proxy`（基于 read + 发布时间接近度）
  - `return_read`（24h/72h 回看）
  - `bookmark_as_strong_positive`
- 离线回放最近 14 天 Smart 排序，输出：
  - `effective_read_per_dau`
  - `completion_rate_proxy`
  - `quick_skip_rate_proxy`
- 结论门槛：至少一个主指标有统计显著提升，且守护指标无明显恶化。

## Phase 1：事件埋点与协议（1 周）

### 3.1 事件定义（前端）

新增事件：
- `entry_impression`
- `entry_open`
- `entry_dwell`
- `entry_scroll_depth`
- `entry_exit`
- `entry_return`（24h 内再次打开）

每条事件最少字段：
- `event_id`（UUID，幂等去重）
- `entry_id`
- `session_id`
- `occurred_at`
- `client_ts`
- `view`（timeline/smart）
- `device_type`
- `active_ms`（仅页面可见且焦点激活时累计）
- `scroll_depth_max`（0-1）

约束：
- `user_id` 不由前端上传，后端从鉴权上下文注入。
- 事件写入采用“至少一次”传输，后端用 `event_id` 保证幂等。

### 3.2 停留时长计算（长度归一化，MVP 必做）

必须考虑文本长度，采用 `est_read_time` 与归一化停留：

- `est_read_time_sec = clamp(word_count / 4.0, 15, 900)`
- `normalized_dwell = clamp(active_ms / 1000 / est_read_time_sec, 0, 1.5)`

说明：
- `word_count` 优先正文纯文本字数；无正文时回退 `summary`。
- 长文天然停留更久，不应直接当作高兴趣；归一化后再打分。

### 3.3 抗噪声策略（防后台挂起）

- 仅在 `document.visibilityState === 'visible'` 且窗口 focus 时累计 `active_ms`
- 切后台、锁屏、最小化时暂停计时
- 单次会话 `active_ms` 上限截断（如 30 分钟）

## Phase 2：标签与聚合（1 周）

### 3.4 标签规则（后端离线任务）

建议标签：
- `quick_skip`: `active_ms < 8000` 且 `scroll_depth_max < 0.2`
- `effective_read`: `normalized_dwell >= 0.2` 或 `scroll_depth_max >= 0.6`
- `completion`: `normalized_dwell >= 0.6` 且 `scroll_depth_max >= 0.9`
- `return_read`: 24h 内回看

### 3.5 聚合窗口

- 按天聚合用户-文章标签（T+1）
- 生成 7 天滑窗特征（用于排序）
- 保存 30 天原始事件，聚合表可长期保留

## Phase 3：MVP 排序融合与灰度（1 周）

### 3.6 评分融合（先规则，不改主模型）

`final_score = base_preference_score + implicit_engagement_boost`

其中：
- `base_preference_score`：`ScoreService` 或 `SimpleScoreService` 输出
- `implicit_engagement_boost`：建议范围 `[-10, +10]`

示例：
- 快跳率高 -> 降权
- 有效阅读率高 -> 升权
- 回看率高 -> 升权

实现约束：
- `implicit_engagement_boost` 计算抽成共享逻辑，避免两套评分服务漂移。
- Smart 候选池扩大（建议 `per_page * 10`）后再排序，避免候选不足掩盖收益。

### 3.7 开关与灰度

新增 TypedConfig：`ImplicitFeedbackConfig`
- `enabled: bool`
- `weight: float`（默认 1.0）
- `sample_rate: float`（事件采样率）
- `min_events: int`（最小样本保护）

灰度策略：
- 先内部账号
- 再 10% 用户（用户级 sticky 分桶）
- 观察指标后放量

## Phase 4：多目标排序升级（2-4 周，可选）

### 3.8 多目标目标函数

优化目标：
- `P(open)`
- `P(effective_read)`
- `P(completion)`
- `E(normalized_dwell)`

组合方式（初版）：
- 线性加权融合
- 后续可升级 GBDT / 两塔 + 排序网络

### 3.9 探索机制（可选）

每屏保留 10%-20% 探索位，避免只推荐“同质内容”。

## 4. 数据与表设计

建议新增表：
- `user_entry_events`（原始事件，含 `event_id` 唯一约束）
- `user_entry_implicit_labels`（按日聚合标签）
- `user_topic_engagement_stats`（用户-主题聚合，可选）

索引建议：
- `(user_id, entry_id, occurred_at)`
- `(entry_id, occurred_at)`
- `(user_id, occurred_at)`
- `event_id UNIQUE`

数据治理：
- 原始事件按时间分区（按天或按月）
- 原始事件 TTL（建议 30-90 天）
- 聚合表保留长期统计

## 5. 代码改造点

前端：
- `frontend/apps/web/src/components/ArticleReader.tsx`
- `frontend/apps/web/src/hooks/*`（新增行为上报 hook）

后端 API / 服务：
- `backend/apps/api/glean_api/routers/entries.py`（新增事件上报接口）
- `backend/packages/core/glean_core/services/entry_service.py`（smart 候选与融合）
- `backend/packages/vector/glean_vector/services/score_service.py`
- `backend/packages/core/glean_core/services/simple_score_service.py`
- `backend/packages/core/glean_core/schemas/config.py`（新增 `ImplicitFeedbackConfig`）

Worker：
- `backend/apps/worker/glean_worker/tasks/*`（新增聚合任务）

数据库：
- `backend/packages/database/glean_database/migrations/versions/*`
- `backend/packages/database/glean_database/models/*`

## 6. 文末 Like 引导策略（建议纳入 MVP）

结论：建议做，但作为“轻引导 + 低频触发”，不打断阅读。

触发条件建议：
- 到达文末（`scroll_depth_max >= 0.95`）
- 且 `normalized_dwell >= 0.4`
- 且该用户近 7 天显式反馈不足（如 `< 3` 次）

交互建议：
- 仅展示一次轻量浮层/条，不遮挡正文
- 支持一键 Like / Dislike / 稍后
- 关闭后同篇不再提示

原因：
- 显式反馈是高质量监督信号，对冷启动和长期漂移纠偏价值高。
- 通过条件触发可减少“打扰感”。

## 7. 验收指标

主指标：
- `effective_read_per_dau`
- `completion_rate`
- `normalized_dwell`

副指标：
- `quick_skip_rate`（期望下降）
- `D1/D7 retention`
- 来源/作者多样性

守护指标：
- 推荐接口 P95 延迟
- worker 积压
- 错误率
- 埋点质量：重复率、缺失率、异常 dwell 比例

## 8. 执行清单（可直接开工）

- [ ] 定义事件协议（含 `event_id` 幂等）
- [ ] 前端完成 `active_ms` + `scroll_depth_max` 上报
- [ ] 新增事件落库与迁移（含去重约束）
- [ ] 生成 T+1 标签聚合任务
- [ ] 增加 `implicit_engagement_boost` 共享计算逻辑
- [ ] 新增 `ImplicitFeedbackConfig` 与灰度控制
- [ ] 增加文末 Like 轻引导
- [ ] 监控看板与告警
- [ ] 小流量 A/B 验证并放量

## 9. 风险与回滚

风险：
- 埋点质量不足导致误判
- 停留时长受后台挂起/多标签页干扰
- 长文短文偏置
- 过度提示导致体验下降

回滚策略：
- 设置 `weight = 0`（软回滚）
- 关闭 `enabled = false`（硬回滚）
- 保留事件采集，后续修正规则再灰度
