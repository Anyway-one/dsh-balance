#!/usr/bin/env node
/**
 * dsh-balance — offline server tests.
 * Mock plugin context + fake HTTPS transport; no harness, no network.
 * DSH_HOME is redirected to a temp dir so the history cache never touches
 * the real profile.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, BALANCE_PATH, PROVIDERS_PATH, isLoopbackAddress, resetBalanceHistoryState } from "../lib/index.js";
import { createHistory, parseHistory, recordSample, samplesOf, serializeHistory } from "../lib/history.js";

const testHome = await mkdtemp(join(tmpdir(), "dsh-balance-test-"));
process.env.DSH_HOME = testHome;

let passed = 0;
async function test(name, fn) {
	try {
		await fn();
		passed += 1;
		console.log(`ok ${name}`);
	} catch (error) {
		console.error(`FAIL ${name}`);
		throw error;
	}
}

const SETTINGS = {
	get: (ns) => {
		if (ns === "llm-deepseek") return { apiKeyEnv: "DEEPSEEK_API_KEY", baseURL: "https://api.deepseek.com" };
		if (ns === "llm-pi-ai") return { providers: { ark: { displayName: "Ark", apiKeyEnv: "ARK_API_KEY", baseURL: "https://ark.example.com" } } };
		return void 0;
	}
};

function credentials(keys = {}) {
	return { resolve: async (ref) => ({ value: keys[ref] ?? "" }) };
}

function fakeTransport(respond, record = {}) {
	return {
		httpsRequest: (url, options, callback) => {
			record.url = url;
			record.options = options;
			record.calls = (record.calls ?? 0) + 1;
			const req = new EventEmitter();
			req.end = () => {};
			req.destroy = (err) => { record.destroyed = err; };
			queueMicrotask(() => {
				const res = respond(url, options);
				const response = new EventEmitter();
				response.statusCode = res.statusCode;
				response.headers = res.headers ?? {};
				callback(response);
				response.emit("data", Buffer.from(res.body ?? ""));
				response.emit("end");
			});
			return req;
		},
		httpRequest: () => {
			throw new Error("http transport must not be used");
		}
	};
}

const publicLookup = async () => [{ address: "1.2.3.4", family: 4 }];

async function boot(overrides = {}) {
	resetBalanceHistoryState();
	const routes = [];
	const effects = [];
	const ctx = {
		credentials: void 0,
		webServer: { register: (entry) => routes.push(entry) },
		effect: (fn, label) => {
			const cleanup = fn();
			effects.push({ label, cleanup });
		},
		logger: { warn: () => {}, info: () => {}, debug: () => {} },
		get: (service) => ({
			settings: overrides.settings ?? SETTINGS,
			credentials: overrides.credentials ?? credentials({ DEEPSEEK_API_KEY: "sk-test" })
		})[service]
	};
	await apply(ctx, {}, {
		disableBackgroundRefresh: true,
		...(overrides.deps ?? {})
	});
	return { routes, effects };
}

function handlerOf(routes, path) {
	const route = routes.find((entry) => entry.path === path);
	assert.ok(route !== void 0, `route ${path} registered`);
	return route.handler;
}

async function call(handler, { method = "GET", url = "/", peer = "127.0.0.1", host = "localhost" } = {}) {
	const res = {
		status: null,
		headers: null,
		body: "",
		writeHead(status, headers) {
			this.status = status;
			this.headers = headers;
		},
		end(body) {
			this.body += body ?? "";
		}
	};
	const req = { method, url, headers: { host }, socket: { remoteAddress: peer } };
	await handler(req, res);
	return res;
}

function parsed(res) {
	return JSON.parse(res.body);
}

//#region routing & fence

await test("apply registers exactly two exact routes", async () => {
	const { routes } = await boot();
	assert.deepEqual(routes.map((r) => r.path).sort(), [BALANCE_PATH, PROVIDERS_PATH].sort());
	for (const route of routes) assert.equal(route.kind, "exact");
});

await test("non-GET methods are refused with 405", async () => {
	const { routes } = await boot();
	const res = await call(handlerOf(routes, BALANCE_PATH), { method: "POST" });
	assert.equal(res.status, 405);
	assert.equal(parsed(res).error, "method-not-allowed");
});

await test("non-loopback peer is refused with 403", async () => {
	const { routes } = await boot();
	const res = await call(handlerOf(routes, BALANCE_PATH), { peer: "10.0.0.1", host: "example.com" });
	assert.equal(res.status, 403);
});

await test("loopback peer with localhost host passes the fence", async () => {
	const { routes } = await boot();
	const res = await call(handlerOf(routes, BALANCE_PATH), { peer: "127.0.0.1", host: "localhost" });
	assert.equal(res.status, 200);
});

//#endregion

//#region balance endpoint

await test("balance: successful DeepSeek query pins DNS, normalizes numbers, and hides the key", async () => {
	const record = {};
	const { routes } = await boot({
		deps: {
			lookup: publicLookup,
			transport: fakeTransport(() => ({
				statusCode: 200,
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" }] })
			}), record)
		}
	});
	const res = await call(handlerOf(routes, BALANCE_PATH), { url: "/api/balance?provider=deepseek-official" });
	assert.equal(res.status, 200);
	const body = parsed(res);
	assert.equal(body.ok, true);
	assert.equal(body.account.status, "ok");
	assert.equal(body.account.balance.total, 110);
	assert.equal(body.account.balance.currency, "CNY");
	assert.equal(body.account.balance.toppedUp, 100);
	assert.equal(String(record.url), "https://api.deepseek.com/user/balance");
	assert.equal(record.options.headers.authorization, "Bearer sk-test");
	assert.equal(record.options.servername, "api.deepseek.com");
	assert.equal(res.body.includes("sk-test"), false, "no key in the response");
});

await test("balance: missing credential → not-configured with the ref name", async () => {
	const { routes } = await boot({ credentials: credentials({}) });
	const res = await call(handlerOf(routes, BALANCE_PATH), { url: "/api/balance?provider=deepseek-official" });
	const body = parsed(res);
	assert.equal(body.ok, true);
	assert.equal(body.account.status, "not-configured");
	assert.deepEqual(body.account.missingCredentials, ["DEEPSEEK_API_KEY"]);
	assert.equal(body.account.balance, null);
});

await test("balance: provider without a scheme is unsupported", async () => {
	const { routes } = await boot();
	const res = await call(handlerOf(routes, BALANCE_PATH), { url: "/api/balance?provider=ark" });
	const body = parsed(res);
	assert.equal(body.ok, true);
	assert.equal(body.account.mode, "unsupported");
	assert.equal(body.account.scheme, null);
	assert.equal(body.account.status, "pending");
});

await test("balance: unknown provider → unknown-provider", async () => {
	const { routes } = await boot();
	const res = await call(handlerOf(routes, BALANCE_PATH), { url: "/api/balance?provider=nope" });
	assert.equal(parsed(res).error, "unknown-provider");
});

await test("balance: result is cached; refresh=1 forces a second upstream query", async () => {
	const record = {};
	const transport = fakeTransport(() => ({
		statusCode: 200,
		body: JSON.stringify({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: "42.00" }] })
	}), record);
	const { routes } = await boot({ deps: { lookup: publicLookup, transport } });
	const handler = handlerOf(routes, BALANCE_PATH);
	const first = await call(handler, { url: "/api/balance?provider=deepseek-official" });
	assert.equal(parsed(first).account.balance.total, 42);
	const second = await call(handler, { url: "/api/balance?provider=deepseek-official" });
	assert.equal(parsed(second).account.balance.total, 42);
	assert.equal(record.calls, 1, "second call served from cache");
	const forced = await call(handler, { url: "/api/balance?provider=deepseek-official&refresh=1" });
	assert.equal(parsed(forced).account.balance.total, 42);
	assert.equal(record.calls, 2, "refresh=1 re-queries upstream");
});

await test("balance: unauthorized upstream maps to unauthorized status", async () => {
	const { routes } = await boot({
		deps: { lookup: publicLookup, transport: fakeTransport(() => ({ statusCode: 401, body: "{}" })) }
	});
	const res = await call(handlerOf(routes, BALANCE_PATH), { url: "/api/balance?provider=deepseek-official" });
	assert.equal(parsed(res).account.status, "unauthorized");
});

await test("balance: no provider param returns every account in one response", async () => {
	const { routes } = await boot();
	const res = await call(handlerOf(routes, BALANCE_PATH), { url: "/api/balance" });
	const body = parsed(res);
	assert.equal(body.ok, true);
	assert.ok(Array.isArray(body.accounts));
	const ids = body.accounts.map((account) => account.id);
	assert.ok(ids.includes("deepseek-official"));
	assert.ok(ids.includes("ark"));
	assert.ok(ids.includes("openrouter"));
	assert.ok(ids.includes("zai"));
	assert.ok(Number.isFinite(body.updatedAt));
});

//#endregion

//#region providers endpoint

await test("providers: lists official route, pi-ai profiles, and legacy entries", async () => {
	const { routes } = await boot();
	const res = await call(handlerOf(routes, PROVIDERS_PATH));
	const body = parsed(res);
	assert.equal(body.ok, true);
	const ids = body.providers.map((p) => p.id);
	assert.ok(ids.includes("deepseek-official"));
	assert.ok(ids.includes("ark"));
	assert.ok(ids.includes("openrouter"));
	assert.ok(ids.includes("zai"));
	const deepseek = body.providers.find((p) => p.id === "deepseek-official");
	assert.equal(deepseek.scheme, "deepseek");
	assert.equal(deepseek.configured, true);
	const ark = body.providers.find((p) => p.id === "ark");
	assert.equal(ark.scheme, null);
});

//#endregion

//#region history

await test("balance: successful fetch records a trend sample onto the account", async () => {
	const record = {};
	const { routes } = await boot({
		deps: {
			lookup: publicLookup,
			transport: fakeTransport(() => ({ statusCode: 200, body: JSON.stringify({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: "42.00" }] }) }), record)
		}
	});
	const res = await call(handlerOf(routes, BALANCE_PATH), { url: "/api/balance?provider=deepseek-official" });
	const body = parsed(res);
	assert.equal(body.account.status, "ok");
	assert.equal(body.account.balance.total, 42);
	assert.ok(Array.isArray(body.account.history));
	assert.equal(body.account.history.length, 1);
	assert.equal(body.account.history[0].total, 42);
	assert.equal(body.account.history[0].currency, "CNY");
});

await test("history: recordSample rate-limits and caps samples", () => {
	const history = createHistory();
	assert.equal(recordSample(history, "a", { t: 1000, total: 1, currency: "CNY" }), true);
	assert.equal(recordSample(history, "a", { t: 1050, total: 2, currency: "CNY" }), false, "within min interval");
	assert.equal(recordSample(history, "a", { t: 61000, total: 3, currency: "CNY" }), true);
	assert.equal(samplesOf(history, "a").length, 2);

	const small = createHistory();
	for (let i = 0; i < 10; i += 1) {
		recordSample(small, "a", { t: (i + 1) * 61000, total: i, currency: "CNY" }, { maxSamples: 3 });
	}
	assert.equal(samplesOf(small, "a").length, 3);
	assert.equal(samplesOf(small, "a")[0].total, 7, "oldest samples dropped");
});

await test("history: serialize/parse round-trips", () => {
	const history = createHistory();
	recordSample(history, "a", { t: 1000, total: 1.5, currency: "CNY" });
	recordSample(history, "a", { t: 61000, total: 2, currency: "CNY" });
	const roundTripped = parseHistory(JSON.parse(JSON.stringify(serializeHistory(history))));
	assert.deepEqual(samplesOf(roundTripped, "a"), samplesOf(history, "a"));
});

//#endregion

//#region background refresh

await test("background refresh starts immediately and schedules a timer", async () => {
	const record = {};
	const timers = [];
	const { effects } = await boot({
		credentials: credentials({ DEEPSEEK_API_KEY: "sk-test", OPENROUTER_MANAGEMENT_KEY: "sk-mgmt", ZAI_API_KEY: "sk-z" }),
		deps: {
			disableBackgroundRefresh: false,
			lookup: publicLookup,
			transport: fakeTransport(() => ({
				statusCode: 200,
				body: JSON.stringify({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: "9.00" }] })
			}), record),
			setInterval: (fn, ms) => {
				timers.push({ fn, ms });
				return { unref: () => {} };
			},
			clearInterval: () => {}
		}
	});
	const background = effects.find((entry) => entry.label === "balance: background refresh");
	assert.ok(background !== void 0, "background refresh effect registered");
	await background.cleanup.ready;
	assert.ok(record.calls >= 3, "startup refresh queried every scheme provider");
	assert.equal(timers.length, 1);
	assert.equal(timers[0].ms, 300000);
});

//#endregion

await test("isLoopbackAddress accepts IPv4, IPv4-mapped IPv6, and ::1", () => {
	assert.equal(isLoopbackAddress("127.0.0.1"), true);
	assert.equal(isLoopbackAddress("127.255.255.255"), true);
	assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
	assert.equal(isLoopbackAddress("::1"), true);
	assert.equal(isLoopbackAddress("10.0.0.1"), false);
	assert.equal(isLoopbackAddress("::ffff:10.0.0.1"), false);
	assert.equal(isLoopbackAddress(void 0), false);
});

await rm(testHome, { recursive: true, force: true });
console.log(`\n${passed} server tests passed`);
