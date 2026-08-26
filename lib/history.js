/**
 * dsh-balance — per-provider balance history ring buffer.
 *
 * Records a compact sample for each successful balance read so the panel can
 * draw a short trend line. Privacy/durability boundary: only aggregate
 * numbers (timestamp + total + currency) are kept, never keys or account
 * identifiers beyond the provider id. Samples are rate-limited (one per
 * provider per minute) and capped (default 300 per provider) so the cache
 * stays small and bounded.
 *
 * @module dsh-balance/history
 */

const HISTORY_VERSION = 1;
const DEFAULT_MAX_SAMPLES = 300;
const DEFAULT_MIN_INTERVAL_MS = 60000;

/** Create an empty history store: `{ samples: Map<providerId, sample[]> }`. */
export function createHistory() {
	return { samples: new Map() };
}

/** Read one provider's samples (a plain array; never the live Map reference). */
export function samplesOf(history, providerId) {
	return history.samples.get(providerId) ?? [];
}

/**
 * Append one sample to a provider's ring buffer (mutating `history`).
 * Returns true when the sample was recorded. A sample is skipped when its
 * numeric fields are invalid or it arrives within `minIntervalMs` of the
 * previous sample (so spamming `refresh=1` cannot flood the history).
 * @param history - history store (mutated).
 * @param providerId - provider key.
 * @param sample - `{ t, total, currency }`.
 * @param deps - `{ maxSamples, minIntervalMs }`.
 */
export function recordSample(history, providerId, sample, deps = {}) {
	if (sample === null || typeof sample !== "object") return false;
	const t = Number(sample.t);
	const total = sample.total;
	if (!Number.isFinite(t) || typeof total !== "number" || !Number.isFinite(total)) return false;
	const minIntervalMs = deps.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
	const maxSamples = deps.maxSamples ?? DEFAULT_MAX_SAMPLES;
	const list = history.samples.get(providerId) ?? [];
	const last = list[list.length - 1];
	if (last !== void 0 && t - last.t < minIntervalMs) return false;
	list.push({ t, total, currency: typeof sample.currency === "string" ? sample.currency : null });
	while (list.length > maxSamples) list.shift();
	history.samples.set(providerId, list);
	return true;
}

/** Serialize a history store into the persisted JSON shape. */
export function serializeHistory(history) {
	const providers = {};
	for (const [id, list] of history.samples) providers[id] = [...list];
	return { version: HISTORY_VERSION, providers };
}

/** Parse persisted JSON back into a history store (lenient). */
export function parseHistory(raw) {
	const history = createHistory();
	if (raw !== null && typeof raw === "object" && raw.providers !== null && typeof raw.providers === "object") {
		for (const [id, list] of Object.entries(raw.providers)) {
			if (!Array.isArray(list)) continue;
			const samples = [];
			for (const entry of list) {
				if (entry === null || typeof entry !== "object") continue;
				const t = Number(entry.t);
				const total = Number(entry.total);
				if (!Number.isFinite(t) || !Number.isFinite(total)) continue;
				samples.push({ t, total, currency: typeof entry.currency === "string" ? entry.currency : null });
			}
			history.samples.set(id, samples);
		}
	}
	return history;
}
