/**
 * dsh-balance — server half.
 *
 * Registers two read-only, loopback-only endpoints on the web server:
 *   GET /api/balance/providers — configured providers + scheme/status summary
 *   GET /api/balance           — balances for every provider (or ?provider=id)
 *
 * Provider configuration is read straight from the harness settings
 * (`llm-deepseek` for the official DeepSeek route, `llm-pi-ai` for every
 * configured pi-ai provider profile), and each provider's API key is resolved
 * through the credentials seam at request time — nothing secret is stored by
 * this plugin. Upstream balance queries go through lib/safe-fetch.js (HTTPS,
 * private-network rejection, DNS pinning).
 *
 * On every successful balance read a compact numeric sample is appended to a
 * bounded per-provider history ring (lib/history.js) and persisted to
 * `<DSH_HOME>/storages/balance-history.json`, so the panel can render a
 * short trend line. Only numbers are stored — never keys or message text.
 *
 * Background refresh queries every balance-capable provider immediately at
 * startup and then every five minutes.
 *
 * @module dsh-balance
 */

import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { balanceSchemeOf, queryBalance } from "./balance.js";
import { safeFetch } from "./safe-fetch.js";
import { createHistory, recordSample, samplesOf, serializeHistory, parseHistory } from "./history.js";

/** Stable Cordis plugin name. */
const name = "balance";

/** Services required before this plugin activates. */
const inject = ["webServer", "credentials", "settings"];

const PROVIDERS_PATH = "/api/balance/providers";
const BALANCE_PATH = "/api/balance";
const UPSTREAM_TIMEOUT_MS = 15000;
const REFRESH_MS = 300000;

/** Default DeepSeek connection facts when the settings namespace is absent. */
const DEEPSEEK_DEFAULTS = {
	apiKeyEnv: "DEEPSEEK_API_KEY",
	baseURL: "https://api.deepseek.com"
};

/** Legacy balance providers shown even without a pi-ai profile. */
const LEGACY_PROVIDERS = [
	{ id: "openrouter", displayName: "OpenRouter", apiKeyEnv: "OPENROUTER_MANAGEMENT_KEY", baseURL: "https://openrouter.ai/api/v1" },
	{ id: "zai", displayName: "Z.ai", apiKeyEnv: "ZAI_API_KEY", baseURL: "https://api.z.ai" }
];

//#region history store (module-level, reset-able for tests)

let historyStore = createHistory();
let historyLogger = null;
let historySaving = false;
let historyPending = false;

/** Test seam: reset the in-memory history and its save flags. */
export function resetBalanceHistoryState() {
	historyStore = createHistory();
	historySaving = false;
	historyPending = false;
}

function historyPath() {
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	return join(home, "storages", "balance-history.json");
}

async function loadHistoryFromDisk() {
	try {
		const raw = JSON.parse(await readFile(historyPath(), "utf8"));
		historyStore = parseHistory(raw);
	} catch {
		/* first run or corrupt cache */
	}
}

async function saveHistoryToDisk() {
	try {
		const path = historyPath();
		await mkdir(dirname(path), { recursive: true });
		const tmp = `${path}.tmp`;
		await writeFile(tmp, JSON.stringify(serializeHistory(historyStore)), "utf8");
		await rename(tmp, path);
	} catch (error) {
		historyLogger?.warn?.(`balance: saving history failed: ${String(error)}`);
	}
}

/** Single-flight save loop: coalesces a burst of records into sequential writes. */
function scheduleHistorySave() {
	historyPending = true;
	if (historySaving) return;
	historySaving = true;
	void (async () => {
		while (historyPending) {
			historyPending = false;
			await saveHistoryToDisk();
		}
		historySaving = false;
	})();
}

/** Record one numeric sample for a successful read (rate-limited by recordSample). */
function recordAccount(account) {
	if (account === null || account === void 0 || account.status !== "ok") return;
	const total = account.balance?.total;
	if (typeof total !== "number" || !Number.isFinite(total)) return;
	const recorded = recordSample(historyStore, account.id, {
		t: account.fetchedAt,
		total,
		currency: account.balance?.currency ?? null
	});
	if (recorded) scheduleHistorySave();
}

/** Attach the provider's trend samples onto an account before it leaves the server. */
function attachHistory(account) {
	if (account !== null && account !== void 0) {
		account.history = samplesOf(historyStore, account.id);
	}
}

//#endregion

/** Write a JSON response. */
function json(res, status, value) {
	const body = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-cache"
	});
	res.end(body);
}

/**
 * Loopback fence, primary on the PEER SOCKET address (not the
 * client-controllable Host header): the request must come from a loopback
 * interface. IPv4-mapped IPv6 (`::ffff:127.0.0.1`) is normalized. The Host
 * header is kept as an additional check, never as the deciding one.
 */
export function isLoopbackAddress(address) {
	if (typeof address !== "string") return false;
	const a = address.toLowerCase();
	if (a === "::1") return true;
	const ipv4 = a.startsWith("::ffff:") ? a.slice(7) : a;
	const octets = ipv4.split(".");
	return octets.length === 4 && octets[0] === "127" && octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** Parse a Host header without breaking bracketed or bare IPv6 literals. */
function hostNameOf(value) {
	if (typeof value !== "string") return null;
	const host = value.trim().toLowerCase();
	if (host.startsWith("[")) {
		const close = host.indexOf("]");
		if (close <= 1) return null;
		const suffix = host.slice(close + 1);
		if (suffix !== "" && !/^:\d+$/.test(suffix)) return null;
		return host.slice(1, close);
	}
	const firstColon = host.indexOf(":");
	const lastColon = host.lastIndexOf(":");
	if (firstColon !== lastColon) return host;
	if (lastColon === -1) return host.replace(/\.$/, "");
	if (!/^\d+$/.test(host.slice(lastColon + 1))) return null;
	return host.slice(0, lastColon).replace(/\.$/, "");
}

function isLoopbackHostHeader(req) {
	const name = hostNameOf(req.headers.host);
	return name === "localhost" || isLoopbackAddress(name);
}

/** Refuse non-loopback callers and non-GET methods before any work. */
export function rejectForeignCaller(req, res) {
	if (req.method !== "GET") {
		res.writeHead(405, { "content-type": "application/json; charset=utf-8" });
		res.end(JSON.stringify({ ok: false, error: "method-not-allowed" }));
		return true;
	}
	const peer = req.socket?.remoteAddress;
	if (isLoopbackAddress(peer) && isLoopbackHostHeader(req)) return false;
	json(res, 403, { ok: false, error: "forbidden" });
	return true;
}

//#region balance service

/** Resolve a credential reference through the harness credentials seam. */
async function resolveCredential(credentials, ref) {
	if (typeof ref !== "string" || ref === "") return "";
	if (credentials === null || credentials === void 0 || typeof credentials.resolve !== "function") return "";
	try {
		const hit = await credentials.resolve(ref);
		const value = typeof hit?.value === "string" ? hit.value.trim() : "";
		return value;
	} catch {
		return "";
	}
}

/**
 * Enumerate the harness's configured providers: the official DeepSeek route
 * (`llm-deepseek` settings namespace) plus every pi-ai provider profile
 * (`llm-pi-ai` settings namespace), plus legacy balance providers when no
 * pi-ai profile of the same id exists. Each entry carries the connection
 * facts (credential ref + base URL) needed to query a balance — no keys.
 */
export async function configuredProviders(ctx) {
	const settings = ctx.get("settings");
	const providers = [];
	const deepseek = settings?.get?.("llm-deepseek");
	if (deepseek !== void 0 && deepseek !== null && typeof deepseek === "object") {
		providers.push({
			id: "deepseek-official",
			displayName: "DeepSeek",
			apiKeyEnv: typeof deepseek.apiKeyEnv === "string" ? deepseek.apiKeyEnv : DEEPSEEK_DEFAULTS.apiKeyEnv,
			baseURL: typeof deepseek.baseURL === "string" ? deepseek.baseURL : DEEPSEEK_DEFAULTS.baseURL
		});
	} else {
		providers.push({
			id: "deepseek-official",
			displayName: "DeepSeek",
			apiKeyEnv: DEEPSEEK_DEFAULTS.apiKeyEnv,
			baseURL: DEEPSEEK_DEFAULTS.baseURL
		});
	}
	const pi = settings?.get?.("llm-pi-ai");
	if (pi !== void 0 && pi !== null && typeof pi === "object" && pi.providers !== void 0 && typeof pi.providers === "object") {
		for (const [route, profile] of Object.entries(pi.providers)) {
			if (profile === null || typeof profile !== "object") continue;
			providers.push({
				id: route,
				displayName: typeof profile.displayName === "string" && profile.displayName.length > 0 ? profile.displayName : route,
				apiKeyEnv: typeof profile.apiKeyEnv === "string" ? profile.apiKeyEnv : void 0,
				baseURL: typeof profile.baseURL === "string" ? profile.baseURL : void 0
			});
		}
	}
	for (const legacy of LEGACY_PROVIDERS) {
		if (!providers.some((provider) => provider.id === legacy.id)) providers.push({ ...legacy });
	}
	return providers;
}

/**
 * In-memory balance cache with per-provider single-flight and a forced bulk
 * refresh. On every successful upstream read, `deps.onBalance(account)` fires
 * so the plugin can record a history sample. Background scheduling is owned
 * by the server plugin.
 */
export function createBalanceService({ credentials, getProviders, deps = {} }) {
	const cache = new Map();
	const inflight = new Map();
	const refreshMs = deps.refreshMs ?? REFRESH_MS;
	const now = deps.now ?? Date.now;

	async function queryOne(provider, force) {
		const scheme = balanceSchemeOf(provider.id);
		const configKey = `${scheme ?? "none"}|${provider.baseURL ?? ""}|${provider.apiKeyEnv ?? ""}`;
		const hit = cache.get(provider.id);
		const age = now() - (hit?.account?.fetchedAt ?? 0);
		if (!force && hit?.configKey === configKey && age >= 0 && age < refreshMs) return hit.account;
		const existing = inflight.get(provider.id);
		if (existing !== void 0) return existing;
		const promise = (async () => {
			const account = {
				id: provider.id,
				displayName: provider.displayName,
				scheme,
				mode: scheme === null ? "unsupported" : "balance",
				status: "pending",
				balance: null,
				fetchedAt: now(),
				history: []
			};
			if (scheme === null) return account;
			if (typeof provider.baseURL !== "string" || provider.baseURL === "") {
				account.status = "not-configured";
				account.missingCredentials = ["baseURL"];
				return account;
			}
			const apiKey = await resolveCredential(credentials, provider.apiKeyEnv);
			if (apiKey === "") {
				account.status = "not-configured";
				account.missingCredentials = [provider.apiKeyEnv];
				return account;
			}
			try {
				const fetchImpl = deps.fetchImpl ?? ((url, init) => safeFetch(url, init, deps));
				account.balance = await queryBalance(scheme, provider.baseURL, apiKey, deps.timeoutMs ?? UPSTREAM_TIMEOUT_MS, fetchImpl);
				account.status = "ok";
				if (typeof deps.onBalance === "function") deps.onBalance(account);
			} catch (error) {
				account.status = error?.providerStatus ?? (error?.name === "TimeoutError" || error?.name === "AbortError" ? "unavailable" : "unavailable");
				account.error = error instanceof Error ? error.message : String(error);
			}
			return account;
		})();
		inflight.set(provider.id, promise);
		try {
			const account = await promise;
			cache.set(provider.id, { configKey, account });
			return account;
		} finally {
			inflight.delete(provider.id);
		}
	}

	async function get(providerId, { force = false } = {}) {
		const provider = (await getProviders()).find((entry) => entry.id === providerId);
		if (provider === void 0) return null;
		return queryOne(provider, force);
	}

	async function getAll({ force = false } = {}) {
		const providers = await getProviders();
		return Promise.all(providers.map((provider) => queryOne(provider, force)));
	}

	async function refreshAll() {
		const providers = await getProviders();
		return Promise.allSettled(providers.filter((provider) => balanceSchemeOf(provider.id) !== null).map((provider) => queryOne(provider, true)));
	}

	async function providerViews() {
		const providers = await getProviders();
		return Promise.all(providers.map(async (provider) => {
			const cached = cache.get(provider.id)?.account;
			const scheme = balanceSchemeOf(provider.id);
			let configured = false;
			if (cached !== void 0) configured = cached.status !== "not-configured";
			else if (scheme !== null) configured = await resolveCredential(credentials, provider.apiKeyEnv) !== "";
			return {
				id: provider.id,
				displayName: provider.displayName,
				scheme,
				configured,
				status: cached?.status ?? "pending",
				fetchedAt: cached?.fetchedAt ?? null,
				balance: cached?.balance ?? null
			};
		}));
	}

	return {
		get,
		getAll,
		refreshAll,
		providerViews,
		validate: async () => { await getProviders(); },
		cached: (providerId) => cache.get(providerId)?.account ?? null
	};
}

//#endregion

//#region route handlers

async function handleProviders(ctx, service, req, res) {
	if (rejectForeignCaller(req, res)) return;
	try {
		json(res, 200, { ok: true, providers: await service.providerViews() });
	} catch (error) {
		ctx.logger.warn(`balance: providers enumeration failed: ${String(error)}`);
		json(res, 500, { ok: false, error: "internal", message: error instanceof Error ? error.message : String(error) });
	}
}

async function handleBalance(ctx, service, req, res) {
	if (rejectForeignCaller(req, res)) return;
	try {
		const url = new URL(req.url ?? "/", "http://x");
		const force = url.searchParams.get("refresh") === "1";
		const requested = url.searchParams.get("provider");
		if (requested !== null && requested !== "") {
			const account = await service.get(requested, { force });
			if (account === null) {
				json(res, 200, { ok: false, error: "unknown-provider", message: `provider "${requested}" is not configured` });
				return;
			}
			attachHistory(account);
			json(res, 200, { ok: true, account });
			return;
		}
		const accounts = await service.getAll({ force });
		for (const account of accounts) attachHistory(account);
		json(res, 200, { ok: true, accounts, updatedAt: Date.now() });
	} catch (error) {
		ctx.logger.warn(`balance: balance fetch failed: ${String(error)}`);
		json(res, 502, { ok: false, error: "failed", message: error instanceof Error ? error.message : String(error) });
	}
}

//#endregion

/** Start an immediate refresh and repeat every five minutes. */
export function startBackgroundRefresh(ctx, service, deps = {}) {
	let running = false;
	let stopped = false;
	let active = Promise.resolve();
	const run = async () => {
		if (running || stopped) return;
		running = true;
		active = (async () => {
			const results = await service.refreshAll();
			for (const result of results) {
				if (result.status === "rejected") ctx.logger.warn(`balance: background refresh failed: ${String(result.reason)}`);
			}
		})().finally(() => {
			running = false;
		});
		return active;
	};
	void run();
	const setTimer = deps.setInterval ?? setInterval;
	const clearTimer = deps.clearInterval ?? clearInterval;
	const timer = setTimer(run, deps.intervalMs ?? REFRESH_MS);
	timer?.unref?.();
	const stop = async () => {
		stopped = true;
		clearTimer(timer);
		await active;
	};
	stop.refreshNow = async () => {
		await active;
		return run();
	};
	/** Resolves when the startup refresh round settles (test seam + diagnostics). */
	stop.ready = active;
	return stop;
}

/** Plugin config schema: everything is optional; unknown keys are tolerated. */
const Config = {
	"~standard": {
		version: 1,
		vendor: "dsh-balance",
		validate(value) {
			const config = value !== null && typeof value === "object" ? value : {};
			return { value: config };
		}
	}
};

/**
 * Plugin body: register the two exact routes and start background refresh.
 * @param ctx - plugin context carrying webServer, credentials, and settings.
 * @param deps - test seams: {service, disableBackgroundRefresh, intervalMs, setInterval, clearInterval, lookup, transport, fetchImpl}.
 */
async function apply(ctx, rawConfig = {}, deps = {}) {
	historyLogger = ctx.logger ?? null;
	await loadHistoryFromDisk();
	const service = deps.service ?? createBalanceService({
		credentials: ctx.get("credentials") ?? ctx.credentials,
		getProviders: () => configuredProviders(ctx),
		deps: { timeoutMs: UPSTREAM_TIMEOUT_MS, lookup: deps.lookup, transport: deps.transport, fetchImpl: deps.fetchImpl, onBalance: recordAccount }
	});
	// Provider ids come from the async Harness settings service, so this
	// dynamic part of config validation must finish before routes start.
	await service.validate();
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: PROVIDERS_PATH,
		handler: (req, res) => handleProviders(ctx, service, req, res)
	}), "balance: providers route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: BALANCE_PATH,
		handler: (req, res) => handleBalance(ctx, service, req, res)
	}), "balance: balance route");
	if (deps.disableBackgroundRefresh !== true) ctx.effect(() => startBackgroundRefresh(ctx, service, deps), "balance: background refresh");
}

export { apply, Config, inject, name, PROVIDERS_PATH, BALANCE_PATH };
