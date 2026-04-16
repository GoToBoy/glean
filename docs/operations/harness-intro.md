# 🚀 Glean Local Harness 介绍 (Harness Intro)

在长周期的 Agentic 应用（如 Glean）开发中，拥有一个稳定的、隔离的、且易于机器检查的测试和运行框架（Harness）是至关重要的。参考 Anthropic 的设计理念，Glean 项目在 `harness/` 目录下通过 Python 实现了一套功能完整的本地开发与诊断支架。

## 🎯 Harness 解决了什么问题？

对于人类开发者和 AI Agent 来说，Harness 提供了一个统一且一致的运行时接口，避免了需要记忆和拼接零散的终端命令，确保了多 Agent 协作阶段（特别是 Evaluator 验证阶段）有客观的验收依据。

它主要完成了以下核心工作：

### 1. 统一的服务编排与启停 (Unified Orchestration)
不再需要手动处理复杂的 `make` 或 `docker-compose` 参数。
* **常用命令：** `python3 -m harness up` / `python3 -m harness down`
* **主要职责：** 自动拉起底层基础设施（如 PostgreSQL, Redis, Milvus，通过 `docker-compose.dev.yml`）以及项目的核心业务组件（`api`, `worker`, `web`, `admin`），同时确保相关运行目录和环境变量被正确加载。

### 2. 工作区隔离与状态管理 (Worktree Isolation & State Management)
* **主要职责：** Harness 默认基于当前的 Git 工作树（worktree）目录生成实例名称（Instance Name），为每个实例分配**独立的端口块**、**独立的 Compose 项目名**和**独立的运行时状态**（状态文件统一存储在 `.harness/` 目录中）。
* **核心收益：** 使得开发者可以在同一台机器上并行运行和测试多个分支代码（例如开多个 worktree 进行多特性开发），从而彻底解决端口冲突或数据库互相覆盖的问题。

### 3. 运行状况探活与健康检查 (Health Checks & Probes)
* **常用命令：** `python3 -m harness status` / `python3 -m harness health`
* **主要职责：** 系统化地对基础设施和各类后台进程的 HTTP 端点及进程存活情况进行探测。这是极其关键的一环，它可以向 Evaluator Agent 直接返回明确的 `healthy` / `unhealthy` 结论，而无需主观猜测。

### 4. 聚焦的日志分发与错误诊断 (Log Filtering & Diagnostics)
* **常用命令：** `python3 -m harness logs <service> --errors` / `python3 -m harness doctor`
* **主要职责：** 将所有后台服务的标准输出进行落盘管理。Agent 可使用 `doctor` 命令综合扫视所有异常，或使用 `--errors` 进行过滤。这是为 LLM 定制的最佳 debug 抓手，有效节省了 Token 消耗并聚焦关键报错。

### 5. 机器可读的运行时快照 (Machine-readable Snapshots)
* **常用命令：** `python3 -m harness snapshot`
* **主要职责：** 输出包含所有服务状态、分配端口、健康探测结果及异常日志片段的结构化 JSON。这是专门为脚本集成和 AI 推理设计的接口，是自动化 CI/CD 或 Agent Evaluator 执行严谨测试判定的基础数据来源。

---

## 💡 为什么它对 Agentic Legibility 如此重要？

Harness 的存在，真正地把代码库变成了“机器可操作”的靶场：
* **入口极简：** 极大地降低了 Agent 引导项目启动所需的背景知识，文档入口只需指向 `docs/operations/local-harness.md`。
* **杜绝盲目自信：** 通过结构化的探活（Health）和客观快照（Snapshot），填补了 Generator Agent 在生成代码后无法自我客观验证的缺陷，从而保证了长周期运行的健壮性。
