# 智能体可读性与长运行应用测试框架演进指南

根据 [Anthropic: Harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) 的设计理念，以及 `agentic-legibility` 技能的最佳实践，本文档对当前 Glean 仓库的现状进行了深度审查，并提出了补齐疏漏和持续演进的实施指南。

## 1. 现状审查与差距分析 (Audit & Gap Analysis)

### A. 智能体可读性 (Agentic Legibility)

**✅ 现有优势：**
* 具备良好的入口规范：存在 `AGENTS.md` 和特定领域的 `CLAUDE.md`。
* 建立了结构化的文档体系：`docs/` 目录下有 `architecture`、`operations`、`agent-workflows` 等分类。
* 已具备基本的多 Agent 协作规范（Planner, Generator, Evaluator）。

**❌ 存在的疏漏与缺失：**
1. **基础设施未完全达标：** 缺失关键的基石结构。根据 agentic-legibility 的强制标准，仓库缺少 `.agents/` 目录和 `.agents/PLANS.md` 规范。
2. **计划目录命名及位置不规范：** 目前计划分散在 `docs/plans/` 和本地专有工具目录 `docs/superpowers/plans/` 中，没有统一到标准的 `docs/exec-plans/` 中。
3. **本地状态未隔离：** `.superpowers/` 是本地特定的技能状态数据，原本被当作代码库的一部分处理（此问题已在最新的 `.gitignore` 中修复，但暴露了对本地 Agent 状态工具缺乏明确边界）。
4. **缺乏机器维度的评分校验：** 缺乏 `score_repo.js` 等类似的自动化检查脚本，无法在 CI 或本地持续把控仓库对于 Agent 的可读性得分。

### B. 长周期应用的测试框架 (Harness Design)

**✅ 现有优势：**
* 已有 `harness/` Python 工具库用于管理本地容器和运行时的启停及监控（`up`, `down`, `logs`, `doctor`），为评估奠定了基础。
* 明确了三阶段的 Agent 结构（Planner 编写契约 -> Generator 冲刺 -> Evaluator 审查），并且有 `evaluator-rubric.md` 和 `handoff-template.md`。

**❌ 存在的疏漏与缺失：**
1. **隔离的客观评估 (External Evaluation) 落地不足：**
   * Anthropic 建议将 Generator 和 Judge(Evaluator) 隔离，通过客观靶场而非主观的“自我评估”来避免 LLM 过于宽容。
   * 尽管仓库中有 `.playwright-mcp/`，但当前 Evaluator 的反馈过于依赖文本审查，尚未将 Playwright 这样的 E2E 测试作为强制的“客观准入”关卡供 Evaluator 使用。
2. **上下文管理与重置 (Context Resets) 机制薄弱：**
   * 长周期开发极易产生“上下文焦虑”（Context Anxiety，随着对话变长，Agent 的注意力开始发散或遗忘）。
   * 目前虽然有交接文档，但没有在机制上强制要求跨阶段（如从 Generator 到 Evaluator）进行**会话重置**（启动全新的干净会话并只带入压缩后的交接文档）。
3. **动态复杂度缺乏管理 (Dynamic Complexity)：**
   * 未明确“当底层模型能力进化时，如何精简脚手架”。系统应当可以弹性伸缩，比如针对简单的需求，自动跳过 Planner 阶段而直接通过快速验收。

---

## 2. 演进与落地指南 (Evolution & Action Guide)

为了让代码库真正成为“智能体的工作操作系统”，需要执行以下三大修复和演进阶段：

### 阶段一：补齐 Agentic Legibility 核心文件 (Initial Setup)
* **创建规范文件：** 新建 `.agents/PLANS.md`，明确 ExecPlans（执行计划）的规范、生命周期和更新约束。
* **重构计划目录：** 将现有的 `docs/plans/` 和 `docs/superpowers/plans/` 迁移并合并到标准的 `docs/exec-plans/` 目录下。后续所有 Planner 输出的 Sprint 合同和架构计划都必须放入此目录。
* **更新引流节点：** 修改 `AGENTS.md` 和 `docs/index.md`，使其引用新的路径标准。彻底从仓库内容中剔除对 `docs/superpowers/` 的追踪，保持开源版本库和本地 AI 工具配置的解耦。

### 阶段二：建立强制的“上下文重置”工作流 (Context Resets)
为了应对长周期构建中的幻觉和质量下降：
* **结构化交接 (Structured Handoffs)：** Generator 在结束一个 Sprint 后，必须更新 `docs/exec-plans/` 里的当前计划状态，并生成一份高度浓缩的变更摘要（去除试错过程和长代码）。
* **强制新会话：** Evaluator 必须在**全新的上下文会话**中启动，只需读取 `handoff-template.md` 的内容和最新的计划，独立验证当前 Git Tree 的状态。

### 阶段三：搭建基于 Playwright 的隔离测试场 (Evaluator Harness)
* **将主观审查转为客观验证：** Evaluator Agent 的主要工具应从“阅读代码”转变为“执行测试”。
* 扩展 `harness/` 命令行或整合 `.playwright-mcp/`，为 Evaluator 提供一键式的端到端验收环境（例如：`python3 -m harness eval --test-suite=e2e`）。
* **判定基准：** 如果 E2E 测试崩溃、终端日志出现 Error、或者视觉截图与规范不符，Evaluator 无需阅读源码，直接驳回并向 Generator 抛出明确的机器级别失败日志。这有效克服了 LLM 面对自己生成的代码时的“盲目自信”。

### 阶段四：动态脚手架调整 (Dynamic Scaffold Maintenance)
* 引入定期的自动化测试（例如通过定期的重构任务），评估当前常用模型的基线能力。
* 如果模型能够以 95% 以上的成功率通过简单的 Bug Fixes，则在 `docs/agent-workflows/default-loop.md` 中为这类微小变更添加“快车道”（Fast-track），跳过 Planner 契约，直接进行 Generator -> Test 的轻量化循环。