#!/usr/bin/env node
/**
 * dsh-balance — offline balance scheme tests.
 * Pure functions only; no network, no harness.
 */
import assert from "node:assert/strict";
import { balanceSchemeOf, numberOr, queryBalance, supportedBalanceSchemes } from "../lib/balance.js";

let passed = 0;
function test(name, fn) {
	try {
		fn();
		passed += 1;
		console.log(`ok ${name}`);
	} catch (error) {
		console.error(`FAIL ${name}`);
		throw error;
	}
}

test("numberOr coerces numbers and numeric strings", () => {
	assert.equal(numberOr(42), 42);
	assert.equal(numberOr(3.5), 3.5);
	assert.equal(numberOr("110.00"), 110);
	assert.equal(numberOr("12.5"), 12.5);
	assert.equal(numberOr("0"), 0);
	assert.equal(numberOr(""), void 0);
	assert.equal(numberOr("abc"), void 0);
	assert.equal(numberOr(null), void 0);
	assert.equal(numberOr(void 0), void 0);
});

test("deepseek scheme picks the CNY entry and normalizes to numbers", async () => {
	let call;
	const balance = await queryBalance("deepseek", "https://api.deepseek.com", "sk-test", 1000, async (url, init) => {
		call = { url, init };
		return {
			ok: true,
			status: 200,
			json: async () => ({
				is_available: true,
				balance_infos: [
					{ currency: "USD", total_balance: "1.00" },
					{ currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" }
				]
			})
		};
	});
	assert.equal(call.url, "https://api.deepseek.com/user/balance");
	assert.equal(call.init.headers.authorization, "Bearer sk-test");
	assert.equal(balance.currency, "CNY");
	assert.equal(balance.total, 110);
	assert.equal(balance.granted, 10);
	assert.equal(balance.toppedUp, 100);
	assert.equal(balance.isAvailable, true);
});

test("openrouter scheme computes remaining from credits minus usage", async () => {
	const balance = await queryBalance("openrouter", "https://openrouter.ai/api/v1", "sk-mgmt", 1000, async () => ({
		ok: true,
		status: 200,
		json: async () => ({ data: { total_credits: 50.5, total_usage: 12.25 } })
	}));
	assert.equal(balance.currency, "USD");
	assert.equal(balance.total, 38.25);
	assert.equal(balance.used, 12.25);
	assert.equal(balance.limit, 50.5);
	assert.equal(balance.isAvailable, true);
});

test("moonshot scheme maps available/cash/voucher", async () => {
	const balance = await queryBalance("moonshot", "https://api.moonshot.cn/v1", "sk-m", 1000, async () => ({
		ok: true,
		status: 200,
		json: async () => ({ data: { available_balance: 80, cash_balance: 60, voucher_balance: 20, currency: "CNY" } })
	}));
	assert.equal(balance.total, 80);
	assert.equal(balance.toppedUp, 60);
	assert.equal(balance.granted, 20);
	assert.equal(balance.currency, "CNY");
});

test("zai scheme falls back to available balance when total is absent", async () => {
	const balance = await queryBalance("zai", "https://api.z.ai", "sk-z", 1000, async () => ({
		ok: true,
		status: 200,
		json: async () => ({ data: { available_balance: 7.5, currency: "CNY" } })
	}));
	assert.equal(balance.total, 7.5);
	assert.equal(balance.toppedUp, 7.5);
});

test("balanceSchemeOf maps ids to schemes and unknown ids to null", () => {
	assert.equal(balanceSchemeOf("deepseek-official"), "deepseek");
	assert.equal(balanceSchemeOf("deepseek"), "deepseek");
	assert.equal(balanceSchemeOf("openrouter"), "openrouter");
	assert.equal(balanceSchemeOf("moonshotai"), "moonshot");
	assert.equal(balanceSchemeOf("kimi"), "moonshot");
	assert.equal(balanceSchemeOf("zai"), "zai");
	assert.equal(balanceSchemeOf("ark"), null);
});

test("supportedBalanceSchemes lists the four schemes", () => {
	assert.deepEqual(supportedBalanceSchemes().sort(), ["deepseek", "moonshot", "openrouter", "zai"]);
});

test("queryBalance maps 401 to an unauthorized provider error", async () => {
	await assert.rejects(
		() => queryBalance("deepseek", "https://api.deepseek.com", "sk", 1000, async () => ({ ok: false, status: 401, json: async () => ({}) })),
		(error) => error.providerStatus === "unauthorized"
	);
});

test("queryBalance maps invalid JSON to an invalid-response error", async () => {
	await assert.rejects(
		() => queryBalance("deepseek", "https://api.deepseek.com", "sk", 1000, async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad json"); } })),
		(error) => error.providerStatus === "invalid-response"
	);
});

console.log(`\n${passed} balance tests passed`);
