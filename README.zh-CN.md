# 💳 dsh-balance

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 网页端（`dsh web`）提供一款**专注的多供应商余额监控**：常驻悬浮窗**一次看清所有已配置供应商的余额**、每个供应商独立的**低余额告警**，以及**余额趋势**迷你折线。

[![README-English](https://img.shields.io/badge/README-English-1F6FEB?style=flat-square)](README.md)
[![License](https://img.shields.io/badge/license-MIT-2da44e?style=flat-square)](LICENSE)

> `dsh-balance` 刻意做得比「用量仪表盘」更窄：它只回答一个问题——*「还剩多少余额，有没有哪个快用完了？」*——并且一眼覆盖所有供应商。

## ✨ 功能速览

### 🌐 多供应商悬浮窗

每个已配置供应商一行，常驻左下角。状态圆点 + 彩色数值一眼看清每个账户的健康状况；sidebar 收起时自动折叠成一枚小胶囊。

- 🟢 **ok** — 余额健康
- 🟡 **low** — 低于该供应商阈值
- 🔴 **bad** — 欠费，或上游查询失败
- ⚪ **neutral** — 未配置 / 无公开余额接口

### ⚠️ 低余额告警

为每个供应商设置阈值（按该供应商币种填写）。余额跌破阈值时该行变黄，悬浮窗顶部的**关注角标**统计需要充值的供应商数量。

### 📈 余额趋势

每次成功查询都会往一个有界、持久化的环形缓冲里追加一条数值采样。详情面板用迷你折线展示余额是在消耗还是稳定。

### 🎛️ 详情面板

点击齿轮打开面板，逐个供应商展示完整明细——可用 / 充值 / 赠送 / 已用 / 总额度——外加趋势线、状态与阈值设置。点一下 ↻ 即可全部刷新。

### 🛠️ 配置卡片

在 **设置 → 插件 → 插件配置 → 余额 Balance** 中图形化配置每个供应商的 API Key（写入 DSH 凭据存储）与可选的接口地址（baseURL）覆盖——无需手改 YAML。

## 安装

仓库公开，任何人都可以安装。二选一：

### npx —— 普通用户（推荐）

通过 `npx` 运行已发布的 `@deepseek-ai/dsh` CLI，无需全局安装。

前置条件：Node.js 20+ 与 pnpm（`corepack enable` 或 `npm i -g pnpm`）——DSH 通过转发给 pnpm 来管理 profile 插件。

```bash
# 1. 把插件装进 web profile（首次使用会自动初始化 profile）
npx @deepseek-ai/dsh plugin --profile web add "github:Anyway-one/dsh-balance"

# 2. 在 设置 → 插件 → 插件配置 → 余额 Balance 中配置 Key（见下方「配置」）

# 3. 启动 web GUI
npx @deepseek-ai/dsh web
```

浏览器硬刷新后，左下角出现悬浮窗。更新 / 卸载：

```bash
npx @deepseek-ai/dsh plugin --profile web update dsh-balance
npx @deepseek-ai/dsh plugin --profile web remove dsh-balance
```

### pnpm + Harness 源码 —— 开发者（推荐）

克隆 Harness 并用 pnpm 从源码构建、运行；再从 git 安装本插件，或链接本地 checkout 进行开发。

```bash
# 1. 克隆并构建 Harness
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build

# 2a. 从 git 安装插件
pnpm dsh plugin --profile web add "github:Anyway-one/dsh-balance"

# 2b. 或：开发 dsh-balance 本身时，链接本地 checkout
pnpm dsh plugin --profile web add "file:/absolute/path/to/dsh-balance"

# 3. 从源码启动 web GUI
pnpm dsh web
```

开发 `dsh-balance` 时：服务端改动需重启 `dsh web`；纯客户端改动（`lib/client.js`）硬刷新即生效。

## 配置

### 图形化配置卡片（推荐）

打开 **设置 → 插件 → 插件配置 → 余额 Balance**。卡片会列出所有已配置的供应商——填入每个供应商的 **API Key**，可选覆盖其 **接口地址（baseURL）**，然后保存。

- Key 写入 DSH 凭据存储（只写、不回显）。
- baseURL 覆盖写入插件自身的 settings 命名空间，下次查询余额即生效。

### 手动凭据（备选）

插件底层仍从 `~/.dsh/.credentials.yaml` 读取相同的凭据引用：

```yaml
DEEPSEEK_API_KEY: sk-your-key-here            # DeepSeek 官方路由
OPENROUTER_MANAGEMENT_KEY: sk-or-v1-...       # OpenRouter 账户（需要 Management Key，不是推理 Key）
ZAI_API_KEY: your-zai-key                     # Z.ai 开放平台
```

Moonshot / Kimi 等 `llm-pi-ai` 中的 provider profile 会自动发现并复用其 `apiKeyEnv`。没有公开余额接口的供应商显示「无公开余额接口」，不会猜测。

## 支持的供应商

| Provider | 上游接口 | 默认凭据引用 |
| --- | --- | --- |
| DeepSeek | `GET {origin}/user/balance` | `DEEPSEEK_API_KEY` |
| OpenRouter | `GET {origin}/api/v1/credits` | `OPENROUTER_MANAGEMENT_KEY` |
| Moonshot / Kimi | `GET {origin}/v1/users/me/balance` | pi-ai provider `apiKeyEnv` |
| Z.ai / 智谱 | `GET {origin}/api/paas/v4/balance` | `ZAI_API_KEY` |

## API

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/api/balance/providers` | 供应商列表、余额 scheme 与状态摘要 |
| `GET` | `/api/balance` | 所有供应商的余额（`accounts[]`，每个含 `history` 趋势）；`?provider=<id>` 查单个，`refresh=1` 强制刷新上游 |
| `GET` | `/api/balance/state` | 供应商列表（`id`/`displayName`/`scheme`/`apiKeyEnv`/`baseURL`）+ 设置 `revision`/`writable`（供配置卡片） |
| `POST` | `/api/balance/mutate` | 写入各供应商 baseURL 覆盖（`{ops, expectedRevision}`） |

读接口非 GET 返回 `405`，非回环请求返回 `403`；所有响应均为 JSON 并带 `Cache-Control: no-cache`。

## 开发与验证

```bash
npm run check         # 全量语法检查
npm test              # 37 个离线测试：余额 scheme、安全边界、服务端边界、settings/mutate、历史缓冲
```

所有测试完全离线，不访问网络、不触碰真实 `~/.dsh`（服务端测试重定向 `DSH_HOME` 到临时目录）。

## 隐私与安全

- API Key 永不进入浏览器响应、插件缓存或日志；凭据由 Harness credentials seam 在请求时解析。
- 上游余额查询：强制 HTTPS、预解析 DNS 并拒绝回环/私网地址、连接固定到校验过的地址（防 DNS rebinding）、响应上限 1 MiB、超时 15 秒。
- 历史缓存 `~/.dsh/storages/` 只保存数值采样（时间戳 + 余额 + 币种），绝不保存密钥或对话文本。
- 请勿将本插件端点经反向代理暴露到局域网或公网。

## License

[MIT](LICENSE)
