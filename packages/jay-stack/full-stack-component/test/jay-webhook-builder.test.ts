import { describe, it, expect, vi } from 'vitest';
import { makeWebhook, isJayWebhook } from '../lib';

describe('makeWebhook', () => {
    it('creates a webhook with name and handler', () => {
        const webhook = makeWebhook('test.change').withHandler(
            async (event, invalidate) => {
                await invalidate('test-contract', { id: '123' });
            },
        );

        expect(webhook.webhookName).toBe('test.change');
        expect(webhook._brand).toBe('JayWebhook');
        expect(typeof webhook.handler).toBe('function');
    });

    it('supports withServices', () => {
        const SERVICE = Symbol('test-service') as any;

        const webhook = makeWebhook('test.change')
            .withServices(SERVICE)
            .withHandler(async (event, invalidate, service) => {
                await invalidate('test-contract');
            });

        expect(webhook.services).toEqual([SERVICE]);
    });

    it('handler receives event and invalidate', async () => {
        const invalidateMock = vi.fn();

        const webhook = makeWebhook('product.updated').withHandler(
            async (event, invalidate) => {
                await invalidate('product-page', { slug: event.payload as string });
            },
        );

        await webhook.handler(
            { type: 'product.updated', payload: 'blue-widget', headers: {} },
            invalidateMock,
        );

        expect(invalidateMock).toHaveBeenCalledWith('product-page', { slug: 'blue-widget' });
    });
});

describe('isJayWebhook', () => {
    it('returns true for JayWebhook objects', () => {
        const webhook = makeWebhook('test').withHandler(async () => {});
        expect(isJayWebhook(webhook)).toBe(true);
    });

    it('returns false for non-webhook values', () => {
        expect(isJayWebhook(null)).toBe(false);
        expect(isJayWebhook(undefined)).toBe(false);
        expect(isJayWebhook({})).toBe(false);
        expect(isJayWebhook({ _brand: 'JayAction' })).toBe(false);
    });
});
