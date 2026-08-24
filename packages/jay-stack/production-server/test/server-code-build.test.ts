import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { discoverServerEntries } from '../lib/builder/server-code-build';

describe('discoverServerEntries', () => {
    let projectRoot: string;

    beforeAll(async () => {
        projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'jay-server-entries-'));
        await fs.mkdir(path.join(projectRoot, 'src/pages'), { recursive: true });
        await fs.mkdir(path.join(projectRoot, 'src/components'), { recursive: true });
        await fs.mkdir(path.join(projectRoot, 'src/plugins/wix-bookings/lib'), {
            recursive: true,
        });

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
});
