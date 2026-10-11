import { describe, it, expect } from 'vitest';
import {
    badRequest,
    clientError4xx,
    forbidden,
    notFound,
    serverError5xx,
    unauthorized,
} from '../lib/render-results';

// Design Log #218 — error constructors carry human-facing `title` and an options bag.

describe('render-results — error constructors (DL#218)', () => {
    it('notFound() defaults to status 404 with no extra fields', () => {
        expect(notFound()).toEqual({ kind: 'ClientError', status: 404, message: undefined });
    });

    it('notFound(message) sets the message only', () => {
        expect(notFound('Gone')).toEqual({
            kind: 'ClientError',
            status: 404,
            message: 'Gone',
        });
    });

    it('notFound(message, { title }) carries the human-facing title', () => {
        expect(notFound('It moved', { title: 'Product not found' })).toEqual({
            kind: 'ClientError',
            status: 404,
            message: 'It moved',
            title: 'Product not found',
        });
    });

    it('clientError4xx carries title, code, and details from the options bag', () => {
        expect(
            clientError4xx(422, 'Bad input', {
                title: 'Could not process',
                code: 'UNPROCESSABLE',
                details: { field: 'email' },
            }),
        ).toEqual({
            kind: 'ClientError',
            status: 422,
            message: 'Bad input',
            title: 'Could not process',
            code: 'UNPROCESSABLE',
            details: { field: 'email' },
        });
    });

    it('serverError5xx carries title and details', () => {
        expect(
            serverError5xx(504, 'Upstream timed out', {
                title: 'This is taking too long',
                details: { upstream: 'inventory', waitedMs: 10000 },
            }),
        ).toEqual({
            kind: 'ServerError',
            status: 504,
            message: 'Upstream timed out',
            title: 'This is taking too long',
            details: { upstream: 'inventory', waitedMs: 10000 },
        });
    });

    it('badRequest / unauthorized / forbidden use the 4xx helpers with the right status', () => {
        expect(badRequest()).toEqual({ kind: 'ClientError', status: 400, message: undefined });
        expect(unauthorized('Login first')).toEqual({
            kind: 'ClientError',
            status: 401,
            message: 'Login first',
        });
        expect(forbidden('Nope', { title: 'Access denied' })).toEqual({
            kind: 'ClientError',
            status: 403,
            message: 'Nope',
            title: 'Access denied',
        });
    });
});
