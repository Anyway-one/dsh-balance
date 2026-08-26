# dsh-balance 项目规则

## 结构

| 文件 | 职责 |
| --- | --- |
| `lib/index.js` | 服务端 Cordis 插件：4 个回环端点（providers/balance/state/mutate）、settings 命名空间 `balance`、凭据 seam、余额缓存、历史采样、5 分钟后台刷新 |
| `lib/balance.js` | 余额 scheme 注册表（DeepSeek/OpenRouter/Moonshot/Z.ai），金额统一规范为 `number` |
| `lib/safe-fetch.js` | 上游安全请求：HTTPS 强制、DNS 固定防 rebinding、1 MiB 上限 |
| `lib/history.js` | 每供应商余额趋势环形缓冲（只存数值，有界、限频） |
| `lib/client.js` | 客户端内嵌悬浮窗（sidebar 中 regionArea 与 footArea 之间，portal 注入）+ 详情面板 + 配置卡片（`settings.plugin.item`）：无构建 `__ModuleLoader__` bundle（手写 jsx-runtime） |
| `scripts/test-*.mjs` | 离线测试（balance/safe-fetch/server） |

## 红线

- 四个端点只接受回环请求（读接口仅 GET，mutate 仅 POST，均校验 peer socket），绝不向公网/局域网开放。
- 凭据只经 Harness credentials seam 解析，永不进响应/缓存/日志；配置卡片用 `api.credentials.set` 写入、不回显。
- baseURL 覆盖与 `hidden` 隐藏标记都写入 settings 命名空间 `balance`（`providers.<id>.baseURL` / `providers.<id>.hidden`）；baseURL 必须校验为 https URL，hidden 必须为布尔。
- 历史缓冲只存数值（时间戳 + 余额 + 币种），永不保存密钥或对话文本。
- 客户端无构建步骤：禁止引入 JSX 构建器依赖；改 `lib/client.js` 手写 `react_jsx_runtime` 调用。
- 不要用 PowerShell 正则替换修改 `lib/` 源码（曾因此清空过文件）；一律用编辑工具逐段修改。
- 服务端改动必须重启 `dsh web` 才生效；纯客户端改动硬刷新即可。

## 常用命令

```bash
npm run check        # 全量语法检查
npm test             # 41 个离线测试，全绿才可提交
```

## 关键约定

- 客户端设置持久化于 localStorage `dsh-balance:settings:v1`；`defaultSettings()` 即产品预设。
- 配置卡片经 `/api/balance/state`（读）+ `/api/balance/mutate`（写）读写 settings 命名空间 `balance`；密钥经 `api.credentials.set`（connection RPC）写入，`api.credentials.describe` 读取「已配置」状态；`hidden` 开关经 mutate 写入，隐藏后该供应商从余额查询与悬浮窗中剔除。
- 悬浮窗在 wide 模式下经 `react-dom` portal 注入 sidebar（`[class*="footArea"]` 之前、`[class*="regionArea"]` 之后），用 `[class*="..."]` 子串匹配而非硬编码 hash 前缀；collapsed（rail）模式仍用固定小胶囊。
- 历史采样限频默认 60s/供应商、上限 300 条/供应商（`lib/history.js`）；改采样语义需同步服务端断言。
- 服务端余额缓存每 5 分钟有效，`refresh=1` 强制重查（`lib/index.js`）。
- 悬浮窗展示「余额状态」时：余额用主题色，健康绿 / 低余额黄 / 欠费红，其余信息用中性色阶。
- 金额已规范为 `number`，客户端格式化用 `fmtCurrency`（小金额自适应 4 位小数）。

## 深入文档

- 安装与外部使用：`README.md` / `README.zh-CN.md`
