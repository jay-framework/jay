/**
 * Page Freeze — Design Log #127
 *
 * Captures a page's ViewState at a point in time and serves it as a
 * static SSR snapshot. Enables designers to create multiple frozen
 * views of a page in different states for side-by-side comparison.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface FreezeEntry {
    id: string;
    name?: string;
    /** The concrete URL path (e.g., /products/kitan) */
    route: string;
    /** The route pattern (e.g., /products/kitan{/:category}) */
    routePattern?: string;
    viewState: object;
    createdAt: string;
}

export class FreezeStore {
    private readonly dir: string;

    constructor(buildFolder: string) {
        this.dir = path.join(buildFolder, 'freezes');
    }

    async save(route: string, viewState: object, routePattern?: string): Promise<FreezeEntry> {
        await fs.mkdir(this.dir, { recursive: true });
        const entry: FreezeEntry = {
            id: randomUUID().slice(0, 8),
            route,
            ...(routePattern && { routePattern }),
            viewState,
            createdAt: new Date().toISOString(),
        };
        await fs.writeFile(
            path.join(this.dir, `${entry.id}.json`),
            JSON.stringify(entry, null, 2),
            'utf-8',
        );
        return entry;
    }

    async get(id: string): Promise<FreezeEntry | undefined> {
        try {
            const content = await fs.readFile(path.join(this.dir, `${id}.json`), 'utf-8');
            return JSON.parse(content) as FreezeEntry;
        } catch {
            return undefined;
        }
    }

    async list(route?: string): Promise<FreezeEntry[]> {
        try {
            const files = await fs.readdir(this.dir);
            const entries: FreezeEntry[] = [];
            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                try {
                    const content = await fs.readFile(path.join(this.dir, file), 'utf-8');
                    const entry = JSON.parse(content) as FreezeEntry;
                    if (!route || entry.routePattern === route || entry.route === route) {
                        entries.push(entry);
                    }
                } catch {
                    // Skip corrupted files
                }
            }
            return entries.sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
        } catch {
            return [];
        }
    }

    async rename(id: string, name: string): Promise<boolean> {
        const entry = await this.get(id);
        if (!entry) return false;
        entry.name = name;
        await fs.writeFile(
            path.join(this.dir, `${id}.json`),
            JSON.stringify(entry, null, 2),
            'utf-8',
        );
        return true;
    }

    async delete(id: string): Promise<boolean> {
        try {
            await fs.unlink(path.join(this.dir, `${id}.json`));
            return true;
        } catch {
            return false;
        }
    }
}
