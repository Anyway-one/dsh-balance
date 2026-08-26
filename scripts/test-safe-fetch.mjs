#!/usr/bin/env node
/**
 * dsh-balance — offline safe-fetch policy tests.
 * No network: DNS is injected, and only policy rejection is exercised.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { isPrivateAddress, resolvePublicAddress, safeFetch } from "../lib/safe-fetch.js";

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

await test("isPrivateAddress covers private/loopback/link-local/multicast/documentation space", () => {
	assert.equal(isPrivateAddress("127.0.0.1"), true);
	assert.equal(isPrivateAddress("10.1.2.3"), true);
	assert.equal(isPrivateAddress("172.16.0.1"), true);
	assert.equal(isPrivateAddress("192.168.1.1"), true);
	assert.equal(isPrivateAddress("169.254.10.10"), true);
	assert.equal(isPrivateAddress("100.64.0.1"), true);
	assert.equal(isPrivateAddress("224.0.0.1"), true);
	assert.equal(isPrivateAddress("192.0.2.1"), true);
	assert.equal(isPrivateAddress("198.51.100.1"), true);
	assert.equal(isPrivateAddress("203.0.113.1"), true);
	assert.equal(isPrivateAddress("1.2.3.4"), false);
	assert.equal(isPrivateAddress("198.18.0.1"), false, "fake-ip pool is allowed for proxy users");
	assert.equal(isPrivateAddress("198.19.255.254"), false, "fake-ip pool is allowed for proxy users");
	assert.equal(isPrivateAddress("::ffff:0:c612:d"), false, "Shadowrocket malformed IPv4-mapped fake-ip is allowed");
	assert.equal(isPrivateAddress("::ffff:198.18.0.13"), false, "IPv4-mapped fake-ip is allowed");
	assert.equal(isPrivateAddress("::1"), true);
	assert.equal(isPrivateAddress("fe80::1"), true);
	assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
	assert.equal(isPrivateAddress("::ffff:192.168.0.1"), true);
	assert.equal(isPrivateAddress("2001:db8::1"), true);
	assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

await test("resolvePublicAddress rejects private IP literals", async () => {
	await assert.rejects(
		() => resolvePublicAddress(new URL("https://10.1.2.3/user/balance")),
		(error) => error.providerStatus === "unsupported"
	);
});

await test("resolvePublicAddress rejects private DNS answers", async () => {
	await assert.rejects(
		() => resolvePublicAddress(new URL("https://api.deepseek.com/user/balance"), { lookup: async () => [{ address: "192.168.1.1", family: 4 }] }),
		(error) => error.providerStatus === "unsupported"
	);
});

await test("resolvePublicAddress pins a public DNS answer", async () => {
	const result = await resolvePublicAddress(new URL("https://api.deepseek.com/user/balance"), {
		lookup: async () => [{ address: "1.2.3.4", family: 4 }]
	});
	assert.equal(result.address, "1.2.3.4");
	assert.equal(result.family, 4);
});

await test("safeFetch rejects http:// URLs", async () => {
	await assert.rejects(
		() => safeFetch("http://api.deepseek.com/user/balance", {}, { lookup: async () => [{ address: "1.2.3.4", family: 4 }] }),
		(error) => error.providerStatus === "unsupported"
	);
});

await test("safeFetch rejects private DNS answers", async () => {
	await assert.rejects(
		() => safeFetch("https://api.deepseek.com/user/balance", {}, { lookup: async () => [{ address: "192.168.1.1", family: 4 }] }),
		(error) => error.providerStatus === "unsupported"
	);
});

await test("safeFetch with allowProxy skips DNS pinning and private-IP rejection", async () => {
	const record = {};
	const transport = {
		httpsRequest: (url, options, callback) => {
			record.url = url;
			record.options = options;
			const req = new EventEmitter();
			req.end = () => {};
			req.destroy = () => {};
			queueMicrotask(() => {
				const res = new EventEmitter();
				res.statusCode = 200;
				res.headers = {};
				callback(res);
				res.emit("data", Buffer.from("{}"));
				res.emit("end");
			});
			return req;
		},
		httpRequest: () => { throw new Error("http transport must not be used"); }
	};
	const result = await safeFetch("https://192.168.1.1/user/balance", {}, { allowProxy: true, transport, lookup: async () => [{ address: "192.168.1.1", family: 4 }] });
	assert.equal(result.ok, true);
	assert.equal(record.options.servername, undefined);
	assert.equal(record.options.lookup, undefined);
});

console.log(`\n${passed} safe-fetch tests passed`);
