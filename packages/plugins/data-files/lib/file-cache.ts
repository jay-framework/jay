import fs from 'node:fs/promises';

interface CacheEntry<T> {
    value: T;
    mtime: number;
    checkedAt: number;
}

const CACHE_TTL_MS = 10_000;

export class FileCache<T> {
    private entries = new Map<string, CacheEntry<T>>();

    async get(filePath: string, loader: () => Promise<T>): Promise<T> {
        const cached = this.entries.get(filePath);
        if (cached) {
            const now = Date.now();
            if (now - cached.checkedAt < CACHE_TTL_MS) return cached.value;
            try {
                const stat = await fs.stat(filePath);
                cached.checkedAt = now;
                if (stat.mtimeMs === cached.mtime) return cached.value;
            } catch {
                // file gone — fall through to reload
            }
        }

        const value = await loader();
        const stat = await fs.stat(filePath);
        this.entries.set(filePath, { value, mtime: stat.mtimeMs, checkedAt: Date.now() });
        return value;
    }

    clear(): void {
        this.entries.clear();
    }
}
