import { describe, it, expect } from 'vitest';
import {
    buildErrorViewState,
    resolveErrorPageToken,
    defaultErrorTitle,
    defaultErrorMessage,
    type ErrorInfo,
} from '../lib';

describe('resolveErrorPageToken (DL#218)', () => {
    it('prefers the exact status token over the family token', () => {
        expect(resolveErrorPageToken(['404', '4xx', '5xx'], 404)).toBe('404');
        expect(resolveErrorPageToken(['502', '5xx'], 502)).toBe('502');
    });

    it('falls back to the family token when no exact token exists', () => {
        expect(resolveErrorPageToken(['4xx', '5xx'], 404)).toBe('4xx');
        expect(resolveErrorPageToken(['5xx'], 503)).toBe('5xx');
    });

    it('returns undefined when neither exact nor family is present', () => {
        expect(resolveErrorPageToken(['4xx'], 500)).toBeUndefined();
        expect(resolveErrorPageToken([], 404)).toBeUndefined();
    });

    it('returns undefined for non-4xx/5xx statuses (v1 scope)', () => {
        expect(resolveErrorPageToken(['3xx', '2xx'], 302)).toBeUndefined();
        expect(resolveErrorPageToken(['1xx'], 100)).toBeUndefined();
        expect(resolveErrorPageToken(['6xx'], 600)).toBeUndefined();
    });
});

describe('default error text (DL#218)', () => {
    it('provides exact per-status defaults', () => {
        expect(defaultErrorTitle(404)).toBe('Page Not Found');
        expect(defaultErrorTitle(500)).toBe('Internal Server Error');
        expect(defaultErrorMessage(404)).toMatch(/could not be found/);
    });

    it('falls back to family-level text for unlisted statuses', () => {
        expect(defaultErrorTitle(418)).toBe('Request Error');
        expect(defaultErrorTitle(599)).toBe('Server Error');
        expect(defaultErrorMessage(418)).toMatch(/your request/);
        expect(defaultErrorMessage(599)).toMatch(/our end/);
    });
});

describe('buildErrorViewState (DL#218)', () => {
    it('fills defaults for title/message and defaults code to empty string', () => {
        const info: ErrorInfo = { status: 404, url: '/missing' };
        const vs = buildErrorViewState(info) as any;
        expect(vs.error).toEqual({
            status: 404,
            title: 'Page Not Found',
            message: 'The page you are looking for could not be found.',
            url: '/missing',
            code: '',
            details: [],
        });
    });

    it('passes through author-supplied title/message/code', () => {
        const info: ErrorInfo = {
            status: 500,
            url: '/boom',
            title: 'Custom Title',
            message: 'Custom message',
            code: 'E_CUSTOM',
        };
        const vs = buildErrorViewState(info) as any;
        expect(vs.error.title).toBe('Custom Title');
        expect(vs.error.message).toBe('Custom message');
        expect(vs.error.code).toBe('E_CUSTOM');
    });

    it('projects the details record to a forEach-able [{ key, value }] list', () => {
        const info: ErrorInfo = {
            status: 504,
            url: '/slow',
            details: { upstream: 'inventory', waitedMs: 10000 },
        };
        const vs = buildErrorViewState(info) as any;
        expect(vs.error.details).toEqual([
            { key: 'upstream', value: 'inventory' },
            { key: 'waitedMs', value: '10000' },
        ]);
    });

    it('merges error over pre-rendered static chrome and exposes __jay.error', () => {
        const vs = buildErrorViewState({ status: 404, url: '/x' }, { brand: 'Acme' }) as any;
        expect(vs.brand).toBe('Acme');
        expect(vs.__jay.error.status).toBe(404);
        expect(vs.__jay.url.path).toBe('/x');
    });
});
