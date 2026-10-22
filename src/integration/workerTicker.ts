// A once-a-second heartbeat driven from a Web Worker. NO Obsidian imports —
// enforced by architectureBoundaries.test.ts.
//
// Why a worker: a backgrounded window throttles *main-thread* timers — Chromium
// bunches them to about once a second, and after a few minutes hidden it checks
// self-rescheduling timers (a setInterval) only once a minute. A worker's own
// timer runs on the worker thread, and its postMessage arrives as a message task
// rather than a timer, so the Pomodoro tick keeps landing roughly on time. The
// session math is wall-clock anchored either way; this only makes the tick — and
// so the Notice / OS notification at a phase end — arrive promptly.

/** Worker body: post an empty message every `ms` milliseconds once told to start. */
const WORKER_SOURCE = 'onmessage=function(e){setInterval(function(){postMessage(0)},e.data)};';

type WorkerCtor = new (url: string) => Worker;

interface UrlApi {
	createObjectURL(blob: Blob): string;
	revokeObjectURL(url: string): void;
}

/**
 * Start a heartbeat calling `onTick` every `intervalMs`; returns its stop
 * function. Falls back to a plain `setInterval` where the runtime has no Worker,
 * or refuses a blob-URL worker (CSP) — up front or later via `onerror`.
 */
export function startWorkerTicker(onTick: () => void, intervalMs = 1000): () => void {
	let fallback: ReturnType<typeof setInterval> | null = null;
	const useFallback = () => {
		if (fallback === null) fallback = setInterval(onTick, intervalMs);
	};
	const stopFallback = () => {
		if (fallback !== null) clearInterval(fallback);
		fallback = null;
	};

	const g = globalThis as { Worker?: WorkerCtor; Blob?: typeof Blob; URL?: UrlApi };
	if (!g.Worker || !g.Blob || !g.URL?.createObjectURL) {
		useFallback();
		return stopFallback;
	}

	const urlApi = g.URL;
	let worker: Worker | null = null;
	let url: string | null = null;
	// The blob URL lives as long as the worker: revoking it straight after
	// construction can race the script fetch on some builds.
	const revoke = () => {
		if (url !== null) urlApi.revokeObjectURL(url);
		url = null;
	};
	try {
		url = urlApi.createObjectURL(new g.Blob([WORKER_SOURCE], { type: 'text/javascript' }));
		worker = new g.Worker(url);
		worker.onmessage = () => onTick();
		worker.onerror = () => {
			worker?.terminate();
			worker = null;
			revoke();
			useFallback();
		};
		worker.postMessage(intervalMs);
	} catch {
		worker = null;
		revoke();
		useFallback();
	}

	return () => {
		worker?.terminate();
		worker = null;
		revoke();
		stopFallback();
	};
}
