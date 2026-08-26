# dsh-balance 项目规则

## 结构

| 文件 | 职责 |
| --- | --- |
| `lib/index.js` | 服务端 Cordis 插件：2 个回环 GET 端点、凭据 seam、余额缓存、历史采样、5 分钟后台刷新 |
| `lib/balance.js` | 余额 scheme 注册表（DeepSeek/OpenRouter/Moonshot/Z.ai），金额统一规范为 `number` |
| `lib/safe-fetch.js` | 上游安全请求：HTTPS 强制、DNS 固定防 rebinding、1 MiB 上限 |
| `lib/history.js` | 每供应商余额趋势环形缓冲（只存数值，有界、限频） |
| `lib/client.js` | 客户端悬浮窗 + 详情面板：无构建 `__ModuleLoader__` bundle（手写 jsx-runtime） |
| `scripts/test-*.mjs` | 离线测试（balance/safe-fetch/server） |

## 红线

- 两个端点只接受回环 GET（peer socket 校验），绝不向公网/局域网开放。
- 凭据只经 Harness credentials seam 解析，永不进响应/缓存/日志。
- 历史缓冲只存数值（时间戳 + 余额 + 币种），永不保存密钥或对话文本。
- 客户端无构建步骤：禁止引入 JSX 构建器依赖；改 `lib/client.js` 手写 `react_jsx_runtime` 调用。
- 不要用 PowerShell 正则替换修改 `lib/` 源码（曾因此清空过文件）；一律用编辑工具逐段修改。
- 服务端改动必须重启 `dsh web` 才生效；纯客户端改动硬刷新即可。

## 常用命令

```bash
npm run check        # 全量语法检查
npm test             # 32 个离线测试，全绿才可提交
```

## 关键约定

- 客户端设置持久化于 localStorage `dsh-balance:settings:v1`；`defaultSettings()` 即产品预设。
- 历史采样限频默认 60s/供应商、上限 300 条/供应商（`lib/history.js`）；改采样语义需同步服务端断言。
- 服务端余额缓存每 5 分钟有效，`refresh=1` 强制重查（`lib/index.js`）。
- 悬浮窗展示「余额状态」时：余额用主题色，健康绿 / 低余额黄 / 欠费红，其余信息用中性色阶。
- 金额已规范为 `number`，客户端格式化用 `fmtCurrency`（小金额自适应 4 位小数）。

## 深入文档

- 安装与外部使用：`README.md` / `README.zh-CN.md`
