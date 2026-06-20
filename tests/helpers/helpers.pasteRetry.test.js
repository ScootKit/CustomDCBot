/*
 * Behavioral tests for postToSCNetworkPaste retry/backoff logic. centra is mocked
 * per-test via jest.doMock under isolateModules so the network never runs; pasteSleep's
 * setTimeout is driven by fake timers so retries resolve instantly. Covers: retry then
 * success, exhausting all attempts, transient-then-permanent classification, and the
 * non-JSON body short-circuit.
 */

afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
});

/** Builds a fake centra whose .send() returns queued responses (last one repeats). */
function mockCentraSequence(responses) {
    let i = 0;
    jest.doMock('centra', () => () => ({
        header() {
            return this;
        },
        body() {
            return this;
        },
        send: async () => {
            const r = responses[Math.min(i, responses.length - 1)];
            i++;
            if (r instanceof Error) throw r;
            return r;
        }
    }));
}

function okResponse(url = '/?ok') {
    return {
        statusCode: 200,
        headers: {},
        json: async () => ({
            status: 0,
            url
        })
    };
}

function floodResponse() {
    return {
        statusCode: 200,
        headers: {},
        json: async () => ({
            status: 1,
            message: 'Flood protection, please wait'
        })
    };
}

async function runAllTimers() {
    // Flush pending promise microtasks then advance fake timers, repeatedly.
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
        jest.runOnlyPendingTimers();
    }
}

describe('postToSCNetworkPaste retry behavior', () => {
    test('retries a flood rejection then succeeds on the next attempt', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.useFakeTimers();
            mockCentraSequence([floodResponse(), okResponse('/?second')]);
            const {postToSCNetworkPaste} = require('../../src/functions/helpers');
            const promise = postToSCNetworkPaste('content');
            await runAllTimers();
            const url = await promise;
            expect(url).toMatch(/\/\?second#/);
        });
    });

    test('throws after exhausting all attempts on persistent flood', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.useFakeTimers();
            mockCentraSequence([floodResponse()]);
            const {
                postToSCNetworkPaste,
                PasteUploadError
            } = require('../../src/functions/helpers');
            const promise = postToSCNetworkPaste('content');
            const assertion = expect(promise).rejects.toBeInstanceOf(PasteUploadError);
            await runAllTimers();
            await assertion;
        });
    });

    test('network error is retryable and eventually succeeds', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.useFakeTimers();
            mockCentraSequence([new Error('ECONNRESET'), okResponse('/?recovered')]);
            const {postToSCNetworkPaste} = require('../../src/functions/helpers');
            const promise = postToSCNetworkPaste('content');
            await runAllTimers();
            const url = await promise;
            expect(url).toMatch(/\/\?recovered#/);
        });
    });

    test('persistent network error throws PasteUploadError with cause', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.useFakeTimers();
            mockCentraSequence([new Error('DNS fail')]);
            const {
                postToSCNetworkPaste,
                PasteUploadError
            } = require('../../src/functions/helpers');
            const promise = postToSCNetworkPaste('content').catch((e) => e);
            await runAllTimers();
            const err = await promise;
            expect(err).toBeInstanceOf(PasteUploadError);
            expect(err.message).toMatch(/network error/i);
            expect(err.cause).toBeInstanceOf(Error);
        });
    });

    test('non-JSON response body throws immediately (no retry)', async () => {
        await jest.isolateModulesAsync(async () => {
            mockCentraSequence([{
                statusCode: 200,
                headers: {},
                json: async () => {
                    throw new Error('Unexpected token <');
                }
            }]);
            const {
                postToSCNetworkPaste,
                PasteUploadError
            } = require('../../src/functions/helpers');
            await expect(postToSCNetworkPaste('x')).rejects.toBeInstanceOf(PasteUploadError);
        });
    });

    test('permanent size rejection is not retried', async () => {
        await jest.isolateModulesAsync(async () => {
            mockCentraSequence([
                {
                    statusCode: 200,
                    headers: {},
                    json: async () => ({
                        status: 1,
                        message: 'Paste size too large'
                    })
                }
            ]);
            const {
                postToSCNetworkPaste,
                PasteUploadError
            } = require('../../src/functions/helpers');
            await expect(postToSCNetworkPaste('x')).rejects.toBeInstanceOf(PasteUploadError);
        });
    });

    test('retryable 503 then 200 succeeds', async () => {
        await jest.isolateModulesAsync(async () => {
            jest.useFakeTimers();
            mockCentraSequence([
                {
                    statusCode: 503,
                    headers: {},
                    json: async () => ({})
                },
                okResponse('/?after503')
            ]);
            const {postToSCNetworkPaste} = require('../../src/functions/helpers');
            const promise = postToSCNetworkPaste('content');
            await runAllTimers();
            const url = await promise;
            expect(url).toMatch(/\/\?after503#/);
        });
    });
});

describe('PasteUploadError shape', () => {
    test('carries name, retryable and retryAfterMs metadata', () => {
        const {PasteUploadError} = require('../../src/functions/helpers');
        const err = new PasteUploadError('boom', {
            retryable: true,
            retryAfterMs: 1234
        });
        expect(err.name).toBe('PasteUploadError');
        expect(err.message).toBe('boom');
        expect(err.retryable).toBe(true);
        expect(err.retryAfterMs).toBe(1234);
        expect(err instanceof Error).toBe(true);
    });

    test('defaults to non-retryable with null metadata', () => {
        const {PasteUploadError} = require('../../src/functions/helpers');
        const err = new PasteUploadError('x');
        expect(err.retryable).toBe(false);
        expect(err.response).toBeNull();
        expect(err.cause).toBeNull();
        expect(err.retryAfterMs).toBeNull();
    });
});