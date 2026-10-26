import { describe, it, expect, vi } from 'vitest';
import type { ArtifactStore } from '../lib/serve/artifact-store';
import type { RouteEntry } from '../lib/types';

let slowResult: any;

vi.mock('../lib/serve/page-parts', () => ({
    getPageParts: async () => ({
        parts: [],
        discoveredInstances: [],
        forEachInstances: [],
        headlessInstanceComponents: [],
    }),
}));

vi.mock('@jay-framework/stack-server-runtime', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@jay-framework/stack-server-runtime')>()),
    DevSlowlyChangingPhase: class {
        async runSlowlyForPage() {
            if (slowResult instanceof Error) throw slowResult;
            return slowResult;
        }
    },
}));

import { renderInstance } from '../lib/serve/render-instance';

// DL#227 — how a slow-render result maps to a miss/refresh outcome.

const route: RouteEntry = {
    pattern: '/products/[slug]',
    segments: [
        { type: 'static', value: 'products' },
        { type: 'param', value: 'slug' },
    ],
    serverModule: 'm',
};

async function outcomeFor(result: any) {
    slowResult = result;
    return renderInstance(route, { slug: 'a' }, {} as ArtifactStore, 1_000);
}

function clientError(status: number) {
    return { kind: 'ClientError', status, message: 'nope' };
}

describe('renderInstance outcomes', () => {
    it('renders a PhaseOutput with renderedAt and combined freshness', async () => {
        expect(
            await outcomeFor({
                kind: 'PhaseOutput',
                rendered: { name: 'A' },
                carryForward: {},
                ttl: 30,
                grace: 3600,
            }),
        ).toEqual({
            kind: 'rendered',
            entry: {
                slowViewState: { name: 'A' },
                carryForward: {},
                renderedAt: 1_000,
                ttl: 30,
                grace: 3600,
            },
        });
    });

    it.each([400, 404, 410, 422])('treats a returned %s as not found', async (status) => {
        expect(await outcomeFor(clientError(status))).toEqual({ kind: 'notFound' });
    });

    it.each([401, 403, 408, 429])('treats a returned %s as transient', async (status) => {
        expect((await outcomeFor(clientError(status))).kind).toEqual('error');
    });

    it('treats a returned 5xx as transient', async () => {
        expect((await outcomeFor({ kind: 'ServerError', status: 500, message: 'x' })).kind).toEqual(
            'error',
        );
    });

    it('surfaces a redirect', async () => {
        expect(
            await outcomeFor({ kind: 'Redirect', status: 301, location: '/products/b' }),
        ).toEqual({
            kind: 'redirect',
            status: 301,
            location: '/products/b',
        });
    });

    it('treats a thrown error as transient', async () => {
        expect((await outcomeFor(new Error('boom'))).kind).toEqual('error');
    });
});
