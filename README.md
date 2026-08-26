# 💳 dsh-balance

A focused **multi-provider balance monitor** for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web GUI (`dsh web`): a persistent dock that shows **every configured provider's balance at once**, per-provider **low-balance alerts**, and a **trend history** sparkline.

[![README-中文](https://img.shields.io/badge/README-%E4%B8%AD%E6%96%87-crimson?style=flat-square)](README.zh-CN.md)
[![License](https://img.shields.io/badge/license-MIT-2da44e?style=flat-square)](LICENSE)

> `dsh-balance` is intentionally narrower than a usage dashboard: it answers one question — *"how much credit is left, and is any of it about to run out?"* — and does it for every provider in a single glance.

## ✨ Features

### 🌐 Multi-provider dock

One row per configured provider, embedded at the bottom of the sidebar (between the session list and the settings foot, full sidebar width). A status dot and colored value tell you the health of each account at a glance; the dock collapses into a small pill when the sidebar folds.

- 🟢 **ok** — balance healthy
- 🟡 **low** — below the provider's threshold
- 🔴 **bad** — out of credit, or the upstream query failed
- ⚪ **neutral** — unconfigured / no public balance API

### ⚠️ Low-balance alerts

Set a per-provider threshold (in that provider's currency). When a balance drops below it, the row turns amber and an **attention badge** on the dock counts how many providers need a top-up.

### 📈 Trend history

Every successful read appends a compact numeric sample to a bounded, persisted ring buffer. The detail panel draws a small sparkline so you can see whether a balance is draining or stable.

### 🎛️ Detail panel

The gear opens a panel listing full breakdowns per provider — available / topped-up / granted / used / total credits — plus the trend line, status, and the threshold control. One click on the ↻ refreshes everything.

### 🛠️ Settings card

Configure every provider from **Settings → Plugins → Plugin configuration → Balance**: API keys (stored in DSH's credential store), optional base URL overrides, and a **show/hide** toggle per provider — hide any unwanted auto-discovered provider (e.g. a pi-ai profile without a public balance API). No manual YAML editing.

## Installation

The repository is public and installable by anyone. Pick one of two paths:

### npx — regular users (recommended)

Run the published `@deepseek-ai/dsh` CLI through `npx`, with no global install.

Prerequisites: Node.js 20+ and pnpm (`corepack enable` or `npm i -g pnpm`) — DSH manages profile plugins by forwarding to pnpm.

```bash
# 1. Add the plugin to the web profile (the profile auto-initializes on first use)
npx @deepseek-ai/dsh plugin --profile web add "github:Anyway-one/dsh-balance"

# 2. Configure keys in Settings → Plugins → Plugin configuration → Balance (see "Configuration" below)

# 3. Boot the web GUI
npx @deepseek-ai/dsh web
```

Hard-refresh the browser; the dock appears at the bottom-left. Update / remove:

```bash
npx @deepseek-ai/dsh plugin --profile web update dsh-balance
npx @deepseek-ai/dsh plugin --profile web remove dsh-balance
```

### pnpm + Harness source — developers (recommended)

Clone the Harness, build it, and run it from source with pnpm; link the plugin from git, or from a local checkout when developing it.

```bash
# 1. Clone and build the harness
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build

# 2a. Install the plugin from git
pnpm dsh plugin --profile web add "github:Anyway-one/dsh-balance"

# 2b. ...or link a local checkout while developing dsh-balance itself
pnpm dsh plugin --profile web add "file:/absolute/path/to/dsh-balance"

# 3. Boot the web GUI from source
pnpm dsh web
```

When developing `dsh-balance`: server-side changes need a `dsh web` restart; client-only changes (`lib/client.js`) apply after a hard refresh.

## Configuration

### Graphical settings card (recommended)

Open **Settings → Plugins → Plugin configuration → Balance**. The card lists every configured provider — enter each **API Key** and optionally override its **base URL**, then save.

- Keys are written to DSH's credential store (write-only, never echoed back).
- base URL overrides land in the plugin's settings namespace and apply to the next balance read.

### Manual credentials (alternative)

Under the hood the plugin reads the same credential references from `~/.dsh/.credentials.yaml`:

```yaml
DEEPSEEK_API_KEY: sk-your-key-here            # official DeepSeek route
OPENROUTER_MANAGEMENT_KEY: sk-or-v1-...       # OpenRouter account (Management Key, not the inference key)
ZAI_API_KEY: your-zai-key                     # Z.ai open platform
```

Moonshot / Kimi profiles under `llm-pi-ai` are discovered automatically and reuse their `apiKeyEnv`. Providers without a public balance API show an explicit "no public balance interface" state — never a guess.

## Supported providers

| Provider | Upstream endpoint | Default credential ref |
| --- | --- | --- |
| DeepSeek | `GET {origin}/user/balance` | `DEEPSEEK_API_KEY` |
| OpenRouter | `GET {origin}/api/v1/credits` | `OPENROUTER_MANAGEMENT_KEY` |
| Moonshot / Kimi | `GET {origin}/v1/users/me/balance` | pi-ai provider `apiKeyEnv` |
| Z.ai / GLM | `GET {origin}/api/paas/v4/balance` | `ZAI_API_KEY` |

## API

| Method | Path | Response |
| --- | --- | --- |
| `GET` | `/api/balance/providers` | provider list, balance scheme, and status summary |
| `GET` | `/api/balance` | balances for every provider (`accounts[]`, each with a `history` trend); `?provider=<id>` for one, `refresh=1` to force an upstream query |
| `GET` | `/api/balance/state` | provider list (`id`/`displayName`/`scheme`/`apiKeyEnv`/`baseURL`) + settings `revision`/`writable` for the config card |
| `POST` | `/api/balance/mutate` | write per-provider base URL overrides (`{ops, expectedRevision}`) |

Read endpoints reject non-GET with `405`; non-loopback callers get `403`; every response is JSON with `Cache-Control: no-cache`.

## Development & testing

```bash
npm run check         # syntax checks for every module and script
npm test              # 41 offline tests: balance schemes, safe-fetch policy, server boundary, settings/mutate, history
```

Tests are fully offline — no network, and the real `~/.dsh` is never touched (server tests redirect `DSH_HOME` to a temp dir).

## Privacy & security

- API keys never enter browser responses, plugin caches, or logs; they are resolved at request time through Harness's credentials seam.
- Upstream balance queries: HTTPS enforced, DNS pre-resolved and private/loopback ranges rejected, connections pinned to the checked address (DNS-rebinding defense), 1 MiB response cap, 15 s timeout.
- History caches under `~/.dsh/storages/` hold only numeric samples (timestamp + balance + currency) — never keys or message text.
- Do not expose these endpoints through a reverse proxy to LAN or the public internet.

## License

[MIT](LICENSE)
