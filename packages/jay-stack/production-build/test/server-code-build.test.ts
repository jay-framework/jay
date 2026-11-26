import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { discoverServerEntries } from '@jay-framework/production-build';

describe('discoverServerEntries', () => {
    let projectRoot: string;

    beforeAll(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jay-server-entries-'));
        await fs.mkdir(path.join(projectRoot, 'src/pages'), { recursive: true });
        await fs.mkdir(path.join(projectRoot, 'src/components'), { recursive: true });
        await fs.mkdir(path.join(projectRoot, 'src/plugins/wix-bookings/lib'), {
            recursive: true,
        });

        await fs.mkdir(path.join(projectRoot, 'src/pages/preview'), { recursive: true });
        await fs.writeFile(
            path.join(projectRoot, 'src/pages/preview/page.jay-html'),
            '<html><head><meta name="jay-dev-only" /></head><body>preview</body></html>\n',
        );
        await fs.writeFile(
            path.join(projectRoot, 'src/pages/preview/page.ts'),
            'export const page = {};\n',
        );
        await fs.writeFile(
            path.join(projectRoot, 'src/components/site-header.ts'),
            'export const SiteHeader = {};\n',
        );
        await fs.writeFile(
            path.join(projectRoot, 'src/plugins/wix-bookings/lib/index.client.ts'),
            'export const bookingFlow = {};\n',
        );
        await fs.writeFile(
            path.join(projectRoot, 'src/plugins/wix-bookings/lib/init.ts'),
            'export const init = {};\n',
        );
    });

    afterAll(async () => {
        await fs.rm(projectRoot, { recursive: true, force: true });
    });

    it('discovers flat component files in src/components', async () => {
        const { entries } = await discoverServerEntries(
            projectRoot,
            path.join(projectRoot, 'src/pages'),
        );

        expect(entries.pages['components/site-header']).toBe(
            path.join(projectRoot, 'src/components/site-header.ts'),
        );
    });

    it('discovers nested local plugin files under src/plugins/*/lib', async () => {
        const { entries } = await discoverServerEntries(
            projectRoot,
            path.join(projectRoot, 'src/pages'),
        );

        expect(entries.pages['plugins/wix-bookings/lib/index.client']).toBe(
            path.join(projectRoot, 'src/plugins/wix-bookings/lib/index.client.ts'),
        );
        expect(entries.pages['plugins/wix-bookings/lib/init']).toBe(
            path.join(projectRoot, 'src/plugins/wix-bookings/lib/init.ts'),
        );
    });

    it('does not compile the page module of a dev-only project page (DL#240)', async () => {
        const { entries } = await discoverServerEntries(
            projectRoot,
            path.join(projectRoot, 'src/pages'),
        );

        expect(Object.keys(entries.pages)).not.toContain('pages/preview/page');
    });

    it('still returns the dev-only route so the build can log its exclusion (DL#240)', async () => {
        const { routes } = await discoverServerEntries(
            projectRoot,
            path.join(projectRoot, 'src/pages'),
        );

        expect(routes.find((r) => r.rawRoute === '/preview')?.devOnly).toBe(true);
    });
});
