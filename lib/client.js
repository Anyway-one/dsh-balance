/**
 * dsh-balance — browser half.
 *
 * A focused, multi-provider balance monitor. Unlike a single-provider
 * selector, the dock shows EVERY configured provider at once — one row per
 * provider with a status dot and its balance, colored by health and a
 * per-provider low-balance threshold. A small attention badge counts
 * providers that are low or out of credit. The detail panel lists full
 * breakdowns (available / topped-up / granted / used / limit), draws a trend
 * sparkline from the server-side history, and lets each provider set its own
 * threshold. Settings persist in localStorage.
 *
 * Hand-written `__ModuleLoader__` bundle (no build step). The slot runtime
 * injects `wide` and `t`; the plugin body registers dictionaries and the
 * `sidebar.footer.action` slot.
 */
window.__ModuleLoader__.load({
	id: "dsh-balance",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		const NS = "dsh-balance";

		//#region css
		const css = [
			// floating dock (persistent, bottom-left, one frame, divider rows)
			".b_dock{position:fixed;left:14px;bottom:72px;z-index:30;display:flex;flex-direction:column;gap:6px;align-items:flex-start}",
			".b_frame{position:relative;box-sizing:border-box;width:100%;min-width:180px;max-width:280px;padding:8px 10px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv2);display:flex;flex-direction:column}",
			".b_head{display:flex;align-items:center;gap:6px;padding-bottom:6px}",
			".b_title{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;line-height:16px;letter-spacing:.02em}",
			".b_badge{flex:none;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:var(--dsw-alias-state-warning-primary,#d29922);color:#fff;font-size:10px;font-weight:600;line-height:16px;text-align:center;font-variant-numeric:tabular-nums}",
			".b_iconBtn{flex:none;width:20px;height:20px;border-radius:6px;border:none;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center}",
			".b_iconBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".b_row{display:flex;align-items:center;gap:7px;padding:7px 0;border:none;background:0 0;cursor:pointer;font:inherit;text-align:left;color:inherit;width:100%}",
			".b_row:hover .b_name{color:var(--dsw-alias-label-primary)}",
			".b_divider{height:1px;background:var(--dsw-alias-border-l1);flex:none}",
			".b_dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-fill-l2)}",
			".b_dot[data-tone=ok]{background:var(--dsw-alias-state-success-primary)}",
			".b_dot[data-tone=low]{background:var(--dsw-alias-state-warning-primary,#d29922)}",
			".b_dot[data-tone=bad]{background:var(--dsw-alias-state-error-primary)}",
			".b_name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;transition:color .15s ease}",
			".b_value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;line-height:18px;font-variant-numeric:tabular-nums;margin-left:auto;transition:color .15s ease}",
			".b_value[data-tone=ok]{color:var(--dsw-alias-state-success-primary)}",
			".b_value[data-tone=low]{color:var(--dsw-alias-state-warning-primary,#d29922)}",
			".b_value[data-tone=bad]{color:var(--dsw-alias-state-error-primary)}",
			// rail mode: a single pill on the collapsed sidebar; click reveals the dock
			".b_rail{position:fixed;bottom:72px;z-index:30;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:var(--dsw-shadow-lv2);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:0;padding:3px 6px;transform:translateX(-50%);transition:transform .15s ease}",
			".b_rail:hover{transform:translateX(-50%) scale(1.05)}",
			".b_railLabel{color:var(--dsw-alias-label-secondary);font-size:9px;line-height:11px}",
			".b_railValue{color:var(--dsw-alias-label-primary);font-size:10px;font-weight:600;line-height:13px;font-variant-numeric:tabular-nums;max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".b_railValue[data-tone=ok]{color:var(--dsw-alias-state-success-primary)}",
			".b_railValue[data-tone=low]{color:var(--dsw-alias-state-warning-primary,#d29922)}",
			".b_railValue[data-tone=bad]{color:var(--dsw-alias-state-error-primary)}",
			".b_scrim{position:fixed;inset:0;z-index:25;background:transparent}",
			// detail panel
			".b_panel{z-index:40;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);width:360px;max-width:calc(100vw - 24px);max-height:78vh;box-shadow:var(--dsw-shadow-lv2);border-radius:12px;flex-direction:column;display:flex;position:fixed;bottom:12px;left:12px;overflow:hidden}",
			".b_panelHead{box-sizing:border-box;border-bottom:1px solid var(--dsw-alias-border-l2);background:0 0;flex:none;justify-content:space-between;align-items:center;min-height:44px;padding:10px 12px;display:flex}",
			".b_panelTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}",
			".b_panelBody{flex:1;min-height:0;padding:10px 12px 12px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}",
			".b_note{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}",
			".b_updated{color:var(--dsw-alias-label-caption);margin:2px 0 0;font-size:10px;line-height:14px;font-variant-numeric:tabular-nums}",
			// provider card
			".b_card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;overflow:hidden}",
			".b_cardHead{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".b_cardName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:12px;font-weight:600;line-height:18px}",
			".b_cardStatus{flex:none;font-size:11px;line-height:16px}",
			".b_cardStatus[data-tone=ok]{color:var(--dsw-alias-state-success-primary)}",
			".b_cardStatus[data-tone=low]{color:var(--dsw-alias-state-warning-primary,#d29922)}",
			".b_cardStatus[data-tone=bad]{color:var(--dsw-alias-state-error-primary)}",
			".b_cardStatus[data-tone=none]{color:var(--dsw-alias-label-tertiary)}",
			".b_cardBody{padding:8px 10px}",
			".b_amountRow{display:flex;align-items:baseline;gap:10px}",
			".b_amount{color:var(--dsw-alias-label-primary);font-size:24px;font-weight:600;line-height:30px;font-variant-numeric:tabular-nums}",
			".b_amount[data-tone=ok]{color:var(--dsw-alias-state-success-primary)}",
			".b_amount[data-tone=low]{color:var(--dsw-alias-state-warning-primary,#d29922)}",
			".b_amount[data-tone=bad]{color:var(--dsw-alias-state-error-primary)}",
			".b_currency{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
			".b_bk{display:grid;grid-template-columns:auto auto;column-gap:12px;row-gap:2px;margin-top:6px;font-size:11px;line-height:17px}",
			".b_bkLabel{color:var(--dsw-alias-label-tertiary);text-align:left;white-space:nowrap}",
			".b_bkValue{color:var(--dsw-alias-label-secondary);font-weight:600;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}",
			".b_sparkWrap{display:flex;align-items:center;gap:8px;margin-top:8px}",
			".b_spark{color:var(--dsw-alias-state-info-primary,#1f6feb);display:block}",
			".b_sparkLabel{color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px}",
			".b_threshold{display:flex;align-items:center;gap:8px;margin-top:8px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:7px}",
			".b_thresholdLabel{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}",
			".b_thresholdInput{box-sizing:border-box;width:86px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 6px;font:inherit;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}",
			".b_thresholdHint{color:var(--dsw-alias-label-caption);font-size:10px;line-height:14px}",
			".b_error{background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;margin:0;padding:7px 8px;font-size:12px;line-height:18px;display:flex}",
			".b_retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0}"
		];
		if (typeof document !== "undefined" && typeof document.createElement === "function") {
			const style = document.createElement("style");
			style.textContent = css.join("");
			document.head.appendChild(style);
		}
		//#endregion

		//#region helpers
		function createLoader() {
			let seq = 0;
			return { start: () => ++seq, isCurrent: (s) => s === seq };
		}

		async function fetchJson(path) {
			const response = await fetch(path, { headers: { accept: "application/json" }, cache: "no-store" });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response.json();
		}

		function interpolate(text, params) {
			if (params === void 0 || params === null) return text;
			return String(text).replace(/\{(\w+)\}/g, (match, key) => params[key] !== void 0 ? String(params[key]) : match);
		}

		function currencySymbol(currency) {
			if (currency === "CNY" || currency === "RMB") return "¥";
			if (currency === "USD") return "$";
			if (currency === "EUR") return "€";
			if (typeof currency === "string" && currency !== "") return `${currency} `;
			return "";
		}

		function fmtCurrency(value, currency) {
			if (value === null || value === void 0) return "–";
			const n = Number(value);
			const sym = currencySymbol(currency);
			if (!Number.isFinite(n) || String(value).trim() === "") return `${sym}${value}`;
			const digits = n !== 0 && Math.abs(n) < 1 ? 4 : 2;
			return `${sym}${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
		}

		/**
		 * Provider health tone: ok (green), low (amber, below the user's
		 * threshold), bad (red, out of credit or failed), null (neutral).
		 */
		function accountTone(account, threshold) {
			if (account === null || account === void 0) return null;
			if (account.status === "pending") return null;
			if (account.mode === "unsupported" || account.scheme === null) return null;
			if (account.status === "not-configured") return null;
			if (account.status !== "ok" || account.balance === null || account.balance === void 0) return "bad";
			const total = Number(account.balance.total);
			if (!Number.isFinite(total)) return "bad";
			if (total <= 0) return "bad";
			if (threshold > 0 && total < threshold) return "low";
			return "ok";
		}

		function accountValue(account) {
			if (account === null || account === void 0) return "…";
			if (account.status === "pending") return "…";
			if (account.mode === "unsupported" || account.scheme === null) return "–";
			if (account.status === "not-configured") return "–";
			if (account.status !== "ok" || account.balance === null || account.balance === void 0) return "!";
			return fmtCurrency(account.balance.total, account.balance.currency);
		}

		function statusTextOf(account, translate) {
			if (account === null || account === void 0) return translate("balance.loading");
			switch (account.status) {
				case "ok": return translate("status.ok");
				case "pending": return translate("balance.loading");
				case "not-configured": return translate("balance.notConfigured", { ref: account.missingCredentials?.[0] ?? "" });
				case "unauthorized": return translate("balance.unauthorized");
				case "rate-limited": return translate("balance.rateLimited");
				case "unavailable": return translate("balance.unavailable");
				case "invalid-response": return translate("balance.invalidResponse");
				default: return translate("balance.loading");
			}
		}
		//#endregion

		//#region settings
		const SETTINGS_KEY = "dsh-balance:settings:v1";

		function defaultSettings() {
			return { thresholds: {} };
		}

		function normalizeSettings(value) {
			const base = defaultSettings();
			if (value === null || typeof value !== "object") return base;
			const thresholds = {};
			if (value.thresholds !== null && typeof value.thresholds === "object") {
				for (const [id, raw] of Object.entries(value.thresholds)) {
					const n = Number(raw);
					if (Number.isFinite(n) && n > 0) thresholds[id] = n;
				}
			}
			return { thresholds };
		}

		function loadSettings() {
			try {
				const raw = localStorage.getItem(SETTINGS_KEY);
				return raw === null ? defaultSettings() : normalizeSettings(JSON.parse(raw));
			} catch {
				return defaultSettings();
			}
		}

		function saveSettings(settings) {
			try {
				localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
			} catch {
				/* storage full or blocked — settings stay session-only */
			}
		}

		function useSettings() {
			const [settings, setSettings] = react.useState(loadSettings);
			react.useEffect(() => {
				saveSettings(settings);
			}, [settings]);
			const setThreshold = react.useCallback((providerId, value) => {
				setSettings((previous) => {
					const thresholds = { ...previous.thresholds };
					if (Number.isFinite(value) && value > 0) thresholds[providerId] = value;
					else delete thresholds[providerId];
					return { thresholds };
				});
			}, []);
			return [settings, setThreshold];
		}
		//#endregion

		//#region locales
		const zh = {
			"dock.title": "余额",
			"dock.attention": "需关注",
			"panel.title": "账户余额",
			"panel.empty": "暂无可查询的供应商。",
			"action.refresh": "刷新",
			"action.retry": "重试",
			"action.close": "关闭",
			"status.ok": "正常",
			"balance.loading": "获取余额中…",
			"balance.notConfigured": "未配置 {ref}（编辑 ~/.dsh/.credentials.yaml）",
			"balance.unsupported": "该供应商无公开余额接口",
			"balance.unauthorized": "凭据无效",
			"balance.rateLimited": "查询被限流，稍后重试",
			"balance.unavailable": "上游不可用",
			"balance.invalidResponse": "上游响应异常",
			"balance.available": "可用余额",
			"balance.toppedUp": "充值余额",
			"balance.granted": "赠送余额",
			"balance.used": "已用",
			"balance.limit": "总额度",
			"balance.threshold": "低余额阈值",
			"balance.thresholdHint": "低于该值时标记为“低余额”（按各币种填写）",
			"balance.noTrend": "暂无趋势（需至少两次采样）",
			"balance.trend": "趋势"
		};
		const en = {
			"dock.title": "Balance",
			"dock.attention": "attention",
			"panel.title": "Balances",
			"panel.empty": "No providers to query.",
			"action.refresh": "Refresh",
			"action.retry": "Retry",
			"action.close": "Close",
			"status.ok": "OK",
			"balance.loading": "Fetching balance…",
			"balance.notConfigured": "{ref} is not configured (edit ~/.dsh/.credentials.yaml)",
			"balance.unsupported": "This provider has no public balance interface.",
			"balance.unauthorized": "The credential is invalid.",
			"balance.rateLimited": "Rate limited; retry later.",
			"balance.unavailable": "Upstream unavailable.",
			"balance.invalidResponse": "Unexpected upstream response.",
			"balance.available": "Available",
			"balance.toppedUp": "Topped up",
			"balance.granted": "Granted",
			"balance.used": "Used",
			"balance.limit": "Total credits",
			"balance.threshold": "Low-balance threshold",
			"balance.thresholdHint": "Flag as low when below this value (in the provider's currency)",
			"balance.noTrend": "No trend yet (needs two samples)",
			"balance.trend": "Trend"
		};
		//#endregion

		//#region small components
		function Dot({ tone }) {
			return react_jsx_runtime.jsx("span", { className: "b_dot", "data-tone": tone ?? void 0 });
		}

		function Sparkline({ points, emptyLabel }) {
			if (!Array.isArray(points) || points.length < 2) {
				return react_jsx_runtime.jsx("span", { className: "b_note", children: emptyLabel });
			}
			const numeric = points.map((p) => Number(p.total));
			if (numeric.some((n) => !Number.isFinite(n))) {
				return react_jsx_runtime.jsx("span", { className: "b_note", children: emptyLabel });
			}
			const w = 128;
			const h = 28;
			const pad = 3;
			const min = Math.min(...numeric);
			const max = Math.max(...numeric);
			const span = max - min || 1;
			const coords = points.map((p, i) => {
				const n = Number(p.total);
				const x = pad + (points.length === 1 ? 0 : i / (points.length - 1)) * (w - pad * 2);
				const y = h - pad - ((n - min) / span) * (h - pad * 2);
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			});
			return react_jsx_runtime.jsx("svg", {
				className: "b_spark",
				viewBox: `0 0 ${w} ${h}`,
				width: w,
				height: h,
				"aria-hidden": true,
				children: react_jsx_runtime.jsx("polyline", {
					points: coords.join(" "),
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.5,
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}

		function ProviderCard({ account, threshold, onThreshold, translate }) {
			const tone = accountTone(account, threshold);
			const statusLabel = statusTextOf(account, translate);

			if (account.mode === "unsupported" || account.scheme === null) {
				return react_jsx_runtime.jsxs("div", {
					className: "b_card",
					children: [
						react_jsx_runtime.jsxs("div", {
							className: "b_cardHead",
							children: [
								react_jsx_runtime.jsx(Dot, { tone: null }),
								react_jsx_runtime.jsx("span", { className: "b_cardName", children: account.displayName }),
								react_jsx_runtime.jsx("span", { className: "b_cardStatus", "data-tone": "none", children: translate("balance.unsupported") })
							]
						})
					]
				});
			}

			const balance = account.balance;
			const rows = [
				{ label: translate("balance.available"), value: balance?.total },
				{ label: translate("balance.toppedUp"), value: balance?.toppedUp },
				{ label: translate("balance.granted"), value: balance?.granted },
				{ label: translate("balance.used"), value: balance?.used },
				{ label: translate("balance.limit"), value: balance?.limit }
			].filter((row) => row.value !== null && row.value !== void 0);

			const isOk = account.status === "ok" && balance !== null && balance !== void 0;
			const currency = balance?.currency;

			return react_jsx_runtime.jsxs("div", {
				className: "b_card",
				children: [
					react_jsx_runtime.jsxs("div", {
						className: "b_cardHead",
						children: [
							react_jsx_runtime.jsx(Dot, { tone }),
							react_jsx_runtime.jsx("span", { className: "b_cardName", children: account.displayName }),
							react_jsx_runtime.jsx("span", { className: "b_cardStatus", "data-tone": tone ?? "none", children: statusLabel })
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "b_cardBody",
						children: [
							react_jsx_runtime.jsxs("div", {
								className: "b_amountRow",
								children: [
									react_jsx_runtime.jsx("span", { className: "b_amount", "data-tone": tone ?? void 0, children: fmtCurrency(isOk ? balance.total : void 0, currency) }),
									typeof currency === "string" && currency !== "" && react_jsx_runtime.jsx("span", { className: "b_currency", children: currency })
								]
							}),
							rows.length > 0 && react_jsx_runtime.jsx("div", {
								className: "b_bk",
								children: rows.flatMap((row) => [
									react_jsx_runtime.jsx("span", { className: "b_bkLabel", children: row.label }, `l-${row.label}`),
									react_jsx_runtime.jsx("span", { className: "b_bkValue", children: fmtCurrency(row.value, currency) }, `v-${row.label}`)
								])
							}),
							react_jsx_runtime.jsxs("div", {
								className: "b_sparkWrap",
								children: [
									react_jsx_runtime.jsx(Sparkline, { points: account.history ?? [], emptyLabel: translate("balance.noTrend") }),
									react_jsx_runtime.jsx("span", { className: "b_sparkLabel", children: translate("balance.trend") })
								]
							}),
							react_jsx_runtime.jsxs("div", {
								className: "b_threshold",
								children: [
									react_jsx_runtime.jsx("span", { className: "b_thresholdLabel", children: translate("balance.threshold") }),
									react_jsx_runtime.jsx("input", {
										type: "number",
										className: "b_thresholdInput",
										min: 0,
										step: "any",
										value: threshold > 0 ? threshold : "",
										placeholder: "0",
										"aria-label": translate("balance.threshold"),
										onChange: (event) => onThreshold(account.id, Number(event.target.value))
									})
								]
							}),
							react_jsx_runtime.jsx("p", { className: "b_updated", children: translate("balance.thresholdHint") })
						]
					})
				]
			});
		}
		//#endregion

		//#region main component
		/**
		 * Sidebar footer action: multi-provider balance dock + detail panel.
		 * @param props - `wide` from the sidebar shell, `t` bound by the slot runtime.
		 */
		function BalanceDock({ wide, t }) {
			const translate = (key, params) => interpolate(t !== void 0 ? t(key) : key, params);
			const [settings, setThreshold] = useSettings();
			const [open, setOpen] = react.useState(false);
			const [dockOpen, setDockOpen] = react.useState(false);
			const [accounts, setAccounts] = react.useState([]);
			const [loading, setLoading] = react.useState(false);
			const [error, setError] = react.useState(null);
			const [refreshedAt, setRefreshedAt] = react.useState(null);
			const mountedRef = react.useRef(true);
			const loaderRef = react.useRef(null);
			if (loaderRef.current === null) loaderRef.current = createLoader();

			const loadAll = react.useCallback((force) => {
				const seq = loaderRef.current.start();
				setLoading(true);
				setError(null);
				fetchJson(`/api/balance${force ? "?refresh=1" : ""}`).then((payload) => {
					if (!mountedRef.current || !loaderRef.current.isCurrent(seq)) return;
					setLoading(false);
					if (payload?.ok !== true) {
						setError(payload?.message ?? "balance failed");
						return;
					}
					setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
					setRefreshedAt(Date.now());
				}).catch((err) => {
					if (!mountedRef.current || !loaderRef.current.isCurrent(seq)) return;
					setLoading(false);
					setError(err instanceof Error ? err.message : String(err));
				});
			}, []);

			react.useEffect(() => {
				mountedRef.current = true;
				loadAll(false);
				return () => {
					mountedRef.current = false;
				};
			}, [loadAll]);

			react.useEffect(() => {
				const timer = setInterval(() => loadAll(false), 300000);
				return () => clearInterval(timer);
			}, [loadAll]);

			const refresh = () => loadAll(true);

			// Only balance-capable providers appear in the dock; the panel shows all.
			const dockAccounts = react.useMemo(() => accounts.filter((account) => account.scheme !== null), [accounts]);

			const attentionCount = react.useMemo(() => {
				return dockAccounts.reduce((count, account) => {
					const tone = accountTone(account, settings.thresholds[account.id] ?? 0);
					return tone === "low" || tone === "bad" ? count + 1 : count;
				}, 0);
			}, [dockAccounts, settings.thresholds]);

			const pillAccount = dockAccounts[0] ?? null;
			const pillTone = accountTone(pillAccount, settings.thresholds[pillAccount?.id] ?? 0);

			const dock = react_jsx_runtime.jsx("div", {
				className: "b_dock",
				"data-dsh-balance-dock": true,
				children: react_jsx_runtime.jsxs("div", {
					className: "b_frame",
					children: [
						react_jsx_runtime.jsxs("div", {
							className: "b_head",
							children: [
								react_jsx_runtime.jsx("span", { className: "b_title", children: translate("dock.title") }),
								attentionCount > 0 && react_jsx_runtime.jsx("span", { className: "b_badge", title: translate("dock.attention"), children: String(attentionCount) }),
								react_jsx_runtime.jsx("button", {
									type: "button",
									className: "b_iconBtn",
									"aria-label": translate("action.refresh"),
									title: translate("action.refresh"),
									onClick: refresh,
									children: react_jsx_runtime.jsx(primitives.IconRefreshOutline14, { size: 12 })
								}),
								react_jsx_runtime.jsx("button", {
									type: "button",
									className: "b_iconBtn",
									"aria-label": translate("panel.title"),
									title: translate("panel.title"),
									onClick: () => { setDockOpen(false); setOpen(true); },
									children: react_jsx_runtime.jsx(primitives.IconSettingsOutline14, { size: 12 })
								})
							]
						}),
						dockAccounts.length === 0
							? react_jsx_runtime.jsx("p", { className: "b_note", children: translate("panel.empty") })
							: dockAccounts.flatMap((account, index) => {
								const tone = accountTone(account, settings.thresholds[account.id] ?? 0);
								return [
									react_jsx_runtime.jsx("button", {
										type: "button",
										className: "b_row",
										onClick: () => { setDockOpen(false); setOpen(true); },
										children: [
											react_jsx_runtime.jsx(Dot, { tone }),
											react_jsx_runtime.jsx("span", { className: "b_name", children: account.displayName }),
											react_jsx_runtime.jsx("span", { className: "b_value", "data-tone": tone ?? void 0, children: accountValue(account) })
										]
									}, account.id),
									index < dockAccounts.length - 1 && react_jsx_runtime.jsx("div", { className: "b_divider" }, `div-${account.id}`)
								];
							})
					]
				})
			});

			const panel = react_jsx_runtime.jsxs("section", {
				className: "b_panel",
				"data-dsh-balance-panel": true,
				"aria-label": translate("panel.title"),
				children: [
					react_jsx_runtime.jsxs("header", {
						className: "b_panelHead",
						children: [
							react_jsx_runtime.jsx("span", { className: "b_panelTitle", children: translate("panel.title") }),
							react_jsx_runtime.jsxs("div", {
								style: { display: "flex", alignItems: "center", gap: 2 },
								children: [
									react_jsx_runtime.jsx("button", {
										type: "button",
										className: "b_iconBtn",
										"aria-label": translate("action.refresh"),
										title: translate("action.refresh"),
										onClick: refresh,
										children: react_jsx_runtime.jsx(primitives.IconRefreshOutline14, { size: 14 })
									}),
									react_jsx_runtime.jsx("button", {
										type: "button",
										className: "b_iconBtn",
										"aria-label": translate("action.close"),
										title: translate("action.close"),
										onClick: () => setOpen(false),
										children: react_jsx_runtime.jsx(primitives.IconCloseOutline16, { size: 14 })
									})
								]
							})
						]
					}),
					react_jsx_runtime.jsxs("div", {
						className: "b_panelBody",
						children: [
							error !== null && react_jsx_runtime.jsxs("div", {
								className: "b_error",
								children: [
									react_jsx_runtime.jsx("span", { children: error }),
									react_jsx_runtime.jsx("button", { type: "button", className: "b_retry", onClick: refresh, children: translate("action.retry") })
								]
							}),
							accounts.length === 0 && error === null
								? react_jsx_runtime.jsx("p", { className: "b_note", children: loading ? translate("balance.loading") : translate("panel.empty") })
								: accounts.map((account) => react_jsx_runtime.jsx(ProviderCard, {
									key: account.id,
									account,
									threshold: settings.thresholds[account.id] ?? 0,
									onThreshold: setThreshold,
									translate
								})),
							refreshedAt !== null && react_jsx_runtime.jsx("p", {
								className: "b_updated",
								children: new Date(refreshedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
							})
						]
					})
				]
			});

			if (open) return panel;
			if (!wide) {
				if (!dockOpen) {
					return react_jsx_runtime.jsx("button", {
						type: "button",
						className: "b_rail",
						style: { left: "14px" },
						"data-dsh-balance-rail": true,
						"aria-label": translate("panel.title"),
						onClick: () => setDockOpen(true),
						children: [
							react_jsx_runtime.jsx("span", { className: "b_railLabel", children: translate("dock.title") }),
							react_jsx_runtime.jsx("span", { className: "b_railValue", "data-tone": pillTone ?? void 0, children: pillAccount !== null ? accountValue(pillAccount) : "–" })
						]
					});
				}
				return react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, {
					children: [
						react_jsx_runtime.jsx("div", { className: "b_scrim", onClick: () => setDockOpen(false) }),
						dock
					]
				});
			}
			return dock;
		}
		//#endregion

		//#region plugin body
		/** Services required by the client plugin body. */
		const inject = ["slots", "locale"];

		/**
		 * Client plugin body: register the dictionaries and the sidebar footer action.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "balance: dictionaries");
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "balance",
				locale: NS,
				order: 10
			}, BalanceDock));
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		exports.BalanceDock = BalanceDock;
		exports.accountTone = accountTone;
		exports.accountValue = accountValue;
		exports.fmtCurrency = fmtCurrency;
		exports.defaultSettings = defaultSettings;
		exports.normalizeSettings = normalizeSettings;
		return module.exports;
	}
});
