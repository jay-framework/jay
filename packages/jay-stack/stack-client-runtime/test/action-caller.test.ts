import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createActionCaller,
    setActionCallerOptions,
    ActionError,
} from '../lib/action-caller';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to create mock response
function mockResponse<T>(data: T, success = true, status = 200) {
    return {
        json: async () => (success ? { success: true, data } : { success: false, error: data }),
        status,
        ok: status >= 200 && status < 300,
    };
}

function mockErrorResponse(code: string, message: string, isActionError = true) {
    return {
        json: async () => ({
            success: false,
            error: { code, message, isActionError },
        }),
        status: isActionError ? 422 : 500,
        ok: false,
    };
}

describe('Action Caller', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        // Reset global options
        setActionCallerOptions({
            baseUrl: '',
            headers: {},
            timeout: 30000,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('createActionCaller', () => {
        it('should create a callable function', () => {
            const caller = createActionCaller('test.action', 'POST');
            expect(typeof caller).toBe('function');
        });

        it('should make POST request by default', async () => {
            mockFetch.mockResolvedValueOnce(mockResponse({ result: 'ok' }));

            const caller = createActionCaller<{ name: string }, { result: string }>('test.greet', 'POST');
            const result = await caller({ name: 'World' });

            expect(result).toEqual({ result: 'ok' });
            expect(mockFetch).toHaveBeenCalledWith(
                '/_jay/actions/test.greet',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ name: 'World' }),
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                    }),
                }),
            );
        });

        it('should make GET request with query params', async () => {
            mockFetch.mockResolvedValueOnce(mockResponse({ items: [] }));

            const caller = createActionCaller<{ query: string }, { items: any[] }>('products.search', 'GET');
            await caller({ query: 'test' });

            expect(mockFetch).toHaveBeenCalledWith(
                '/_jay/actions/products.search?query=test',
                expect.objectContaining({
                    method: 'GET',
                }),
            );
            // GET requests should not have a body
            expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
        });

        it('should encode complex objects in _input param for GET', async () => {
            mockFetch.mockResolvedValueOnce(mockResponse({ items: [] }));

            const caller = createActionCaller<{ filters: { category: string } }, { items: any[] }>(
                'products.search',
                'GET',
            );
            await caller({ filters: { category: 'electronics' } });

            const calledUrl = mockFetch.mock.calls[0][0] as string;
            expect(calledUrl).toContain('_input=');
            expect(calledUrl).toContain(encodeURIComponent(JSON.stringify({ filters: { category: 'electronics' } })));
        });

        it('should return data on success', async () => {
            const expectedData = { cartCount: 5 };
            mockFetch.mockResolvedValueOnce(mockResponse(expectedData));

            const caller = createActionCaller<{ productId: string }, { cartCount: number }>('cart.addToCart');
            const result = await caller({ productId: '123' });

            expect(result).toEqual(expectedData);
        });
    });

    describe('error handling', () => {
        it('should throw ActionError for business logic errors', async () => {
            mockFetch.mockResolvedValueOnce(mockErrorResponse('OUT_OF_STOCK', 'Product is out of stock'));

            const caller = createActionCaller('cart.addToCart');

            try {
                await caller({});
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(ActionError);
                expect(error).toMatchObject({
                    code: 'OUT_OF_STOCK',
                    message: 'Product is out of stock',
                });
            }
        });

        it('should throw ActionError for server errors', async () => {
            mockFetch.mockResolvedValueOnce(mockErrorResponse('INTERNAL_ERROR', 'Database connection failed', false));

            const caller = createActionCaller('test.action');

            try {
                await caller({});
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(ActionError);
                expect((error as ActionError).code).toBe('INTERNAL_ERROR');
            }
        });

        it('should throw ActionError with UNKNOWN_ERROR when no error details', async () => {
            mockFetch.mockResolvedValueOnce({
                json: async () => ({ success: false }),
                status: 500,
                ok: false,
            });

            const caller = createActionCaller('test.action');

            try {
                await caller({});
                expect.fail('Should have thrown');
            } catch (error) {
                expect((error as ActionError).code).toBe('UNKNOWN_ERROR');
            }
        });

        it('should throw ActionError for network errors', async () => {
            mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

            const caller = createActionCaller('test.action');

            try {
                await caller({});
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(ActionError);
                expect((error as ActionError).code).toBe('NETWORK_ERROR');
            }
        });

        it('should throw ActionError for timeout', async () => {
            vi.useFakeTimers();

            // Create a fetch that never resolves
            mockFetch.mockImplementationOnce(
                () =>
                    new Promise((_, reject) => {
                        // Simulate abort
                        setTimeout(() => {
                            const abortError = new Error('Aborted');
                            abortError.name = 'AbortError';
                            reject(abortError);
                        }, 100);
                    }),
            );

            setActionCallerOptions({ timeout: 50 });
            const caller = createActionCaller('test.action');

            const promise = caller({});
            vi.advanceTimersByTime(100);

            try {
                await promise;
                expect.fail('Should have thrown');
            } catch (error) {
                expect((error as ActionError).code).toBe('TIMEOUT');
            }
        });
    });

    describe('setActionCallerOptions', () => {
        it('should apply baseUrl to requests', async () => {
            mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

            setActionCallerOptions({ baseUrl: 'https://api.example.com' });
            const caller = createActionCaller('test.action');
            await caller({});

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.example.com/_jay/actions/test.action',
                expect.any(Object),
            );
        });

        it('should apply custom headers to requests', async () => {
            mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

            setActionCallerOptions({
                headers: {
                    Authorization: 'Bearer token123',
                    'X-Custom': 'value',
                },
            });
            const caller = createActionCaller('test.action');
            await caller({});

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer token123',
                        'X-Custom': 'value',
                    }),
                }),
            );
        });

        it('should merge options when called multiple times', async () => {
            mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

            setActionCallerOptions({ baseUrl: 'https://api.example.com' });
            setActionCallerOptions({ headers: { 'X-Custom': 'value' } });

            const caller = createActionCaller('test.action');
            await caller({});

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.example.com/_jay/actions/test.action',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'X-Custom': 'value',
                    }),
                }),
            );
        });
    });

    describe('HTTP methods', () => {
        it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('should make %s request with body', async (method) => {
            mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

            const caller = createActionCaller('test.action', method);
            await caller({ data: 'test' });

            expect(mockFetch).toHaveBeenCalledWith(
                '/_jay/actions/test.action',
                expect.objectContaining({
                    method,
                    body: JSON.stringify({ data: 'test' }),
                }),
            );
        });

        it('should make GET request without body', async () => {
            mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

            const caller = createActionCaller('test.action', 'GET');
            await caller({ param: 'value' });

            expect(mockFetch.mock.calls[0][1].body).toBeUndefined();
        });
    });

    describe('ActionError class', () => {
        it('should create error with code and message', () => {
            const error = new ActionError('TEST_CODE', 'Test message');

            expect(error.code).toBe('TEST_CODE');
            expect(error.message).toBe('Test message');
            expect(error.name).toBe('ActionError');
            expect(error).toBeInstanceOf(Error);
        });
    });
});

