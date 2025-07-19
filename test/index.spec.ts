import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Memory Locks Worker', () => {
	it('responds with API documentation (unit style)', async () => {
		const request = new IncomingRequest('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		const responseData = await response.json();
		expect(responseData.message).toBe('Memory Locks Worker API');
		expect(responseData.endpoints.generateLocks).toBe('POST /api/locks/generate/{count} (requires X-API-Key header)');
	});

	it('responds with API documentation (integration style)', async () => {
		const response = await SELF.fetch('https://example.com');
		const responseData = await response.json();
		expect(responseData.message).toBe('Memory Locks Worker API');
		expect(responseData.endpoints.generateLocks).toBe('POST /api/locks/generate/{count} (requires X-API-Key header)');
	});

	it('rejects lock creation without API key', async () => {
		const request = new IncomingRequest('http://example.com/api/locks/generate/5', { method: 'POST' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
		const responseData = await response.json();
		expect(responseData.error).toBe('Unauthorized: Invalid API key');
	});
});
