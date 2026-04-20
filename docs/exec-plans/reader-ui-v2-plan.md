# Reader UI v2 执行规划

## 1. 目标与非目标

### 目标
把 Reader 页面重设计为"每日收录"式 UI,按照 `/reader-ui-v2.html` 原型落地到生产代码。核心理念:

- **主视图 = 今日收录**:进页面第一眼看到的是今天从订阅源收到了什么,而不是传统的"收件箱列表 + 详情"布局
- **按文件夹分段**:内容按用户已有的 folder 分 section 展示
- **订阅列表和设置降级为辅助**:右侧折叠式侧栏,不再是主导航
- **Header 直接给数据**:日期 + 今日收录篇数 + 源数 + 阅读进度

### 非目标(第一期不做)
- ❌ **不做"今日精选"算法**。原型里 Hero 区的"今日精选 · 深度"那个大文章、以及"今日热点 · 6 个源同时报道"的 trending 卡片,本期**完全移除**,后续阶段再引入
- ❌ 不做跨源聚合(embedding 聚类)
- ❌ 不做 AI 摘要 / LLM 打分
- ❌ 不改后端,纯前端工作

## 2. 视觉与交互参考

**唯一视觉源:** `/Users/ming/Sites/github/glean/reader-ui-v2.html`

实现前先用浏览器打开这个文件看一遍。实现时忠实复刻它的:
- 排版层级(宋体大标题 / Inter UI / 字重与间距)
- 配色(米白主背景 / 砖红 accent / 卡片边框 / dark mode)
- 响应式断点(1200 / 900 / 720 / 480)
- 响应式网格(`repeat(auto-fill, minmax(320px, 1fr))` 自动分列)
- hover 微交互(左侧红色竖线、背景色过渡)
- 右侧栏活动图标 + 面板滑出动画
- 移动端:侧栏变为底部标签栏,面板变为 bottom sheet

## 3. 要移除/要保留

原型里的内容,对照处理:

| 模块 | 处理 |
|---|---|
| 顶部 topnav(logo / 日期切换 / 搜索 / + 添加订阅) | ✅ 保留 |
| Masthead(日期 / 今日收录 / 统计条 / 阅读进度) | ✅ 保留 |
| Hero section(今日精选 · 深度) | ❌ **移除** |
| Trending card(今日热点 · 6 个源同时报道) | ❌ **移除** |
| Section: AI / 技术 及其卡片网格 | ✅ 保留,按用户的 folder 动态渲染 |
| Section: 设计 / 产品 | ✅ 同上,循环渲染每个 folder |
| Section: 其他(compact time flow) | ✅ 保留,装下未分类 / 核心源 / 小文件夹的文章 |
| 右侧活动栏(订阅 / 稍后读 / 设置) | ✅ 保留 |
| 订阅面板(文件夹树) | ✅ 保留 |
| 稍后读面板 | ✅ 保留 |
| 设置面板(主题 / 字号 / 排版 / 阅读 / 同步 / 数据 / 账户) | ✅ 保留 |
| 添加订阅 modal | ✅ 保留 |
| 昨日入口(底部"回顾昨日收录") | ✅ 保留,连接到 ?date= 前一天 |

## 4. 技术栈与集成点

### 复用的基础设施
- **框架**:React 18 + TypeScript,Vite 构建
- **样式**:Tailwind CSS 4(原型里是内联 CSS,要翻译成 Tailwind utility classes + 可能少量 CVA 变体)
- **组件**:`@glean/ui` 的 Button、Sheet、Dialog、ScrollArea、Skeleton、Tooltip、Switch 等
- **数据**:TanStack Query + 已有 services(`entryService`、`folderService`、`feedService`、`bookmarkService`)
- **路由**:React Router 7,复用 `useReaderController` 的 URL 参数模式
- **图标**:`lucide-react`
- **日期**:`date-fns`
- **i18n**:`@glean/i18n`(文案走翻译,但本期可以先硬编码中文,标注 TODO)

### 文件位置
新页面作为 Reader 的**新 view mode**,而不是替换掉现有 timeline / today-board:

```
frontend/apps/web/src/pages/reader/
├── shared/
│   ├── ReaderCore.tsx              # 需要扩展:支持新的 view='digest'
│   ├── useReaderController.ts      # 需要扩展:解析新的 view 值
│   └── components/
│       └── DigestView/             # 新增目录
│           ├── index.tsx           # 主容器
│           ├── DigestMasthead.tsx  # 顶部统计区
│           ├── DigestSection.tsx   # 单个 folder section
│           ├── DigestArticleCard.tsx
│           ├── DigestCompactList.tsx
│           ├── DigestSidebar.tsx   # 右侧活动栏 + 面板
│           ├── FeedsPanel.tsx
│           ├── SavedPanel.tsx
│           ├── SettingsPanel.tsx
│           ├── AddFeedModal.tsx
│           ├── DateSwitcher.tsx
│           └── digestHelpers.ts    # 分组 / 统计逻辑
```

URL 参数扩展:`view=digest`,沿用 `date=YYYY-MM-DD`。

### 数据流映射

| UI 需要 | 数据来源 |
|---|---|
| Masthead 统计(篇数、源数、已读数、预计阅读时长) | 从 `GET /entries/today?date=` 响应里的 items 前端汇总 |
| 文件夹列表(section 划分 + 侧栏树) | `useFolders({ type: 'feed' })` → `GET /folders` |
| 每个文件夹下的今日文章 | `GET /entries/today?folder_id=xxx&date=` 或客户端按 folder_id 分组一次性获取 |
| 订阅列表(侧栏下的源 + 未读数) | `feedService.syncAll()` → `GET /feeds/sync/all` |
| 稍后读列表 | `GET /entries?read_later=true` |
| 昨日 / 切换日期 | 修改 url `date=` 参数触发重新 fetch |
| 标记已读 / 稍后读 / 收藏 | `useUpdateEntryState()`(已有),`bookmarkService.create()` |
| 添加订阅 | `feedService` 的订阅发现 + 创建流程(已有) |
| 主题 / 字号 / 排版 设置 | 用户 settings(`UserSettings`),写入后端或本地 |

**关键决策**:前端用**一次 `GET /entries/today?date=&limit=500`** 拿到当天全部文章,然后在前端按 `feed.folder_id` 分组,避免 N+1 请求。如果某用户订阅量极大(>500 篇/天),后续再考虑分文件夹分页。

### Section 分组规则(替代"今日精选"的朴素逻辑)

没有算法,就按最朴素的规则组织:

1. **遍历用户的顶层 folders**(来自 `/folders` tree,过滤 `type='feed'`)
2. **对每个 folder**,找出今日文章中 `feed.folder_id` 属于这个 folder 或其子 folder 的,组成一个 section
3. **没有 folder 的源**(folder_id 为 null),归到最末尾的"其他"section
4. **每个 section 内部**按 `published_at` 倒序
5. **Section 为空**(今日该 folder 无文章)→ 不渲染
6. **文章超过 6 篇的 section** → 显示前 6 篇 + "查看全部 N 篇 ↓" 按钮,点击展开

**Compact time flow 规则**:最后一个 section 叫"其他",用紧凑列表样式(原型里的 `.compact-list`),装:
- 没有归到任何 folder 的源的文章
- 极短文章(< 500 字)即使有 folder 也归这里(可选,通过 setting 控制)

### 状态与路由

扩展 `useReaderController`:

```ts
// 现有参数
feed, folder, entry, view: 'timeline' | 'today-board', tab, date

// 新增
view: 'timeline' | 'today-board' | 'digest'
```

digest 视图下,`feed` 和 `folder` 参数被忽略(digest 永远是全量今日)。点击 section 里的 feed 色点可以跳回 timeline 视图且预设 feed_id。

**侧栏状态**(当前打开哪个面板:feeds / saved / settings / 无),建议放 Zustand,不进 URL——这是纯 UI 状态。

## 5. 实施步骤

按这个顺序做,每一步做完都能让 UI 先跑起来看效果。

### Step 1: 基础骨架(空 Digest 页面 + 路由)
1. 在 `pages/reader/shared/components/DigestView/index.tsx` 创建 `<DigestView />` 空组件
2. 修改 `useReaderController` 接受 `view='digest'`
3. 在 `ReaderCore` 或 `ReaderDesktopShell` 里,当 `view === 'digest'` 时渲染 `<DigestView />`,绕过原来的 timeline / today-board 分支
4. 通过 url `?view=digest` 能访问到空页面 → 打通

### Step 2: Masthead
1. 创建 `DigestMasthead.tsx`
2. 用 `useTodayEntries(date)` hook 封装 `GET /entries/today?date=`(可以新写或复用现有 hook)
3. 前端汇总:`stats = { total, sourceCount, topicCount, estimatedMinutes, readCount }`
4. 按原型渲染:日期 / 今日收录 / 四个 stat + progress bar
5. 日期切换器(左右箭头),状态通过 url `date=` 驱动

### Step 3: 右侧栏骨架
1. 创建 `DigestSidebar.tsx`:56px 宽的活动栏 + 三个 activity button
2. 用 Zustand 存 `activePanel: 'feeds' | 'saved' | 'settings' | null`
3. 点击 button 切换面板
4. 主内容区 margin-right 用 CSS transition 响应 active 状态
5. 空面板先占位(只渲染 panel-head)

### Step 4: Feeds 面板
1. 创建 `FeedsPanel.tsx`
2. `useFolders({ type: 'feed' })` + `feedService.syncAll()` 组合数据
3. 折叠/展开文件夹(本地 state)
4. 每个源显示 custom_title + unread_count
5. 底部"添加订阅"按钮打开 modal(下一步)

### Step 5: Saved 面板
1. 创建 `SavedPanel.tsx`
2. `GET /entries?read_later=true&per_page=20`
3. 每条卡片点击 → 主区打开文章(或跳 timeline view entry=id)

### Step 6: Settings 面板
1. 创建 `SettingsPanel.tsx`
2. 按原型的分组:外观 / 阅读 / 同步 / 数据 / 账户
3. 复用 `@glean/ui` 的 Switch、ToggleGroup(seg-opt 组件)
4. 接 `UserSettings` 的读写(主题、字号、排版、today_board_default_view 等)
5. 账户卡片显示当前 user 的 email + plan
6. 导入/导出 OPML:接 `GET/POST /feeds/opml`(如果已有)或标注 TODO

### Step 7: Add Feed modal
1. 创建 `AddFeedModal.tsx`,用 `@glean/ui` 的 Dialog
2. 输入 URL → `feedService.discover()` → 成功后 `feedService.subscribe()`
3. 可选:输入 focus 时显示最近添加过的 suggestion chips

### Step 8: Sections 主体(核心工作量)
1. 创建 `digestHelpers.ts`:
   - `groupEntriesByFolder(entries, folders)` → `Map<folderId | null, Entry[]>`
   - `estimateReadingMinutes(entry)` → `Math.ceil(wordCount / 300)`
2. 创建 `DigestSection.tsx`(folder 一个 section)
   - section-head:folder name + "N 篇 · M 个源" + 全部已读 / 折叠按钮
   - article grid:`DigestArticleCard` 用 CSS Grid 自动分列
   - 超过 6 篇显示"查看全部"
3. 创建 `DigestArticleCard.tsx`:
   - tag(来源名或 feed 自定义标签)
   - 标题(宋体)
   - 摘要(3 行截断)
   - 底部:来源色点 + 来源名 + 时间,悬停显示 mark read / save 操作
   - 整卡点击打开文章阅读器
4. 在 `DigestView` 里循环渲染所有 non-empty section

### Step 9: "其他"compact section
1. 创建 `DigestCompactList.tsx`
2. 用网格两列布局(`minmax(420px, 1fr)`)
3. 每行:时间 / 标题 + 来源 / 操作
4. 前 8 条默认显示,"查看全部 N 篇"展开剩余

### Step 10: 响应式与移动端
1. 基于原型的断点调整:1200 / 900 / 720 / 480
2. 移动端(< 720):
   - Sidebar 变 fixed bottom tab bar
   - Panel 变 bottom sheet(用 `@glean/ui` 的 Sheet 组件)
   - Masthead 统计换行,进度条独占一行
3. 平板:padding 缩小,列数减少(Grid auto-fill 天然支持)

### Step 11: 边界状态
1. **Loading**:Masthead 统计用 Skeleton,卡片用 `EntryListItemSkeleton`(复用)
2. **空状态**(今日无文章):显示"今日静默 · 回顾昨日收录 →",引导到前一天
3. **错误状态**:TanStack Query 的 error 走 `@glean/ui/Alert`
4. **未登录**:沿用现有 auth 守卫

### Step 12: 交互细节
1. 键盘快捷键:
   - `?` 打开快捷键参考(复用 `@glean/ui/Kbd`)
   - `j/k` 上下一条文章
   - `o/enter` 打开
   - `s` 稍后读
   - `m` 标记已读
   - `Esc` 关闭面板
   - `⌘K` 搜索(本期可先占位)
2. 顶部阅读进度条(基于滚动百分比)
3. 自动标记已读:文章滚出视口超过 1s 自动 `updateEntryState({ is_read: true })`(可在 settings 里关)

## 6. 验收标准

完工的定义:

- [x] 访问 `/reader?view=digest` 加载 digest 页面
- [x] Masthead 显示今天真实数据(从 API 来)
- [x] 每个有今日文章的 folder 作为独立 section 展示
- [x] 文章卡片样式与原型视觉一致(排版 / 配色 / hover)
- [x] 点击右侧图标切换 feeds / saved / settings 面板,主区平滑让位
- [x] 添加订阅 modal 可用,新订阅真能进系统
- [x] 切换日期刷新整页数据
- [x] 亮暗主题切换正常
- [x] 标记已读 / 稍后读 / 收藏按钮真工作
- [x] 移动端:侧栏变底部 tab,面板变 bottom sheet
- [x] 现有 timeline / today-board 视图不受影响(不 regression)
- [x] 无控制台错误,没有 TanStack Query 无限 refetch

## 7. 明确不做的(如果后续要做的放到 v2 / v3)

- ❌ 今日精选(Hero 区):需要排序算法,v2 做
- ❌ 今日热点聚合:需要 embedding,v2 做
- ❌ LLM 摘要卡片:v3
- ❌ 昨日回顾的完整 UI(本期只做切换日期即可,"昨日摘要"特殊视图不做)
- ❌ OPML 可视化导入(本期只做按钮 + 文件上传 + 调 API,错误处理基础即可)
- ❌ 自定义主题色、订阅源图标上传

## 8. 测试与提交

- 单元测试:`digestHelpers.ts` 的分组函数、`estimateReadingMinutes` 要有测试
- 组件测试:`DigestMasthead`、`DigestArticleCard` 用 React Testing Library 测渲染和交互
- E2E 至少一个 happy path:打开 digest → 看到 section → 标记已读 → section 计数更新
- 走现有项目的 lint / typecheck / prettier 流程
- 新增依赖请在 PR 描述说明

分多个小 PR 提交,按 Step 1-12 切分,每个 step 一个 PR,方便 review。
