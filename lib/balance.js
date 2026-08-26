/**
 * dsh-balance — provider balance schemes.
 *
 * A pure, testable registry of upstream balance endpoints. Each scheme knows
 * the request path (relative to the provider's configured base URL) and how
 * to normalize the response into one shared shape:
 *
 *   { isAvailable, currency, total, used, limit, granted, toppedUp }
 *
 * Every monetary field is normalized to a finite `number` (upstream providers
 * disagree on number vs string) or `undefined` when absent. Providers with no
 * public balance API have no scheme: the UI shows an explicit "no public
 * balance interface" state instead of guessing.
 *
 * API facts follow each provider's public documentation. The scheme layout is
 * informed by dsh-usage-stats (MIT) / dsh-usage (MIT) and reimplemented here
 * so this plugin stays self-contained.
 *
 * @module dsh-balance/balance
 */

/** Coerce a numeric-ish value (number, or numeric string) to a finite number. */
export function numberOr(value) {
	if (typeof value === "number") return Number.isFinite(value) ? value : void 0;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isFinite(n) ? n : void 0;
	}
	return void 0;
}

const SCHEMES = {
	/** DeepSeek: GET {origin}/user/balance — pick the CNY balance_infos entry. */
	deepseek: {
		url: (baseURL) => new URL("/user/balance", baseURL).href,
		parse: (json) => {
			const infos = Array.isArray(json?.balance_infos) ? json.balance_infos : [];
			const info = infos.find((entry) => entry?.currency === "CNY") ?? infos[0] ?? {};
			return {
				isAvailable: json?.is_available === true,
				currency: typeof info.currency === "string" ? info.currency : void 0,
				total: numberOr(info.total_balance),
				granted: numberOr(info.granted_balance),
				toppedUp: numberOr(info.topped_up_balance)
			};
		}
	},
	/** OpenRouter account credits; the endpoint requires a Management Key. */
	openrouter: {
		url: (baseURL) => new URL("/api/v1/credits", baseURL).href,
		parse: (json) => {
			const totalCredits = numberOr(json?.data?.total_credits);
			const totalUsage = numberOr(json?.data?.total_usage);
			const remaining = totalCredits !== void 0 && totalUsage !== void 0 ? totalCredits - totalUsage : void 0;
			return {
				isAvailable: remaining !== void 0 ? remaining > 0 : void 0,
				currency: "USD",
				total: remaining,
				used: totalUsage,
				limit: totalCredits
			};
		}
	},
	/** Moonshot / Kimi: GET {origin}/v1/users/me/balance — available/cash/voucher. */
	moonshot: {
		url: (baseURL) => new URL("/v1/users/me/balance", baseURL).href,
		parse: (json) => {
			const data = json?.data ?? {};
			const available = numberOr(data.available_balance);
			return {
				isAvailable: available !== void 0 ? available > 0 : void 0,
				currency: typeof data.currency === "string" ? data.currency : void 0,
				total: available,
				granted: numberOr(data.voucher_balance),
				toppedUp: numberOr(data.cash_balance)
			};
		}
	},
	/** Z.AI / GLM: GET {origin}/api/paas/v4/balance — total + available. */
	zai: {
		url: (baseURL) => new URL("/api/paas/v4/balance", baseURL).href,
		parse: (json) => {
			const data = json?.data ?? {};
			const total = numberOr(data.total_balance) ?? numberOr(data.available_balance);
			return {
				isAvailable: total !== void 0 ? total > 0 : void 0,
				currency: typeof data.currency === "string" ? data.currency : void 0,
				total,
				toppedUp: numberOr(data.available_balance)
			};
		}
	}
};

function providerError(status, message, httpStatus) {
	const error = new Error(message);
	error.providerStatus = status;
	if (httpStatus !== void 0) error.httpStatus = httpStatus;
	return error;
}

function responseStatus(status) {
	if (status === 401 || status === 403) return "unauthorized";
	if (status === 429) return "rate-limited";
	return status >= 500 ? "unavailable" : "invalid-response";
}

/** Map a provider id (dsh adapter id or pi-ai route) to a balance scheme id. */
export function balanceSchemeOf(providerId) {
	if (providerId === "deepseek-official" || providerId === "deepseek") return "deepseek";
	if (providerId === "openrouter") return "openrouter";
	if (providerId === "moonshotai" || providerId === "moonshotai-cn" || providerId === "kimi" || providerId === "kimi-coding") return "moonshot";
	if (providerId === "zai" || providerId === "zai-coding-cn") return "zai";
	return null;
}

/** Query one provider's balance. Throws on transport/HTTP errors. */
export async function queryBalance(scheme, baseURL, apiKey, timeoutMs = 15000, fetchImpl = fetch) {
	const spec = SCHEMES[scheme];
	if (spec === void 0) throw new Error(`no balance scheme "${scheme}"`);
	const response = await fetchImpl(spec.url(baseURL), {
		headers: { authorization: `Bearer ${apiKey}` },
		signal: AbortSignal.timeout(timeoutMs)
	});
	if (!response.ok) throw providerError(responseStatus(response.status), `balance API returned HTTP ${response.status}`, response.status);
	let body;
	try {
		body = await response.json();
	} catch {
		throw providerError("invalid-response", "balance API returned invalid JSON");
	}
	return spec.parse(body);
}

/** Scheme ids with built-in support (for docs/tests). */
export function supportedBalanceSchemes() {
	return Object.keys(SCHEMES);
}
