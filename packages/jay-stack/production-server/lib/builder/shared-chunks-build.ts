import { build as viteBuild } from 'vite';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface SharedChunksBuildResult {
    manifest: Record<string, string>;
    outputDir: string;
}

const SHARED_PACKAGES = [
    '@jay-framework/stack-client-runtime',
    '@jay-framework/component',
    '@jay-framework/reactive',
    '@jay-framework/runtime',
    '@jay-framework/view-state-merge',
    '@jay-framework/fullstack-component',
];

export async function buildSharedChunks(
    outputDir: string,
    projectRoot: string,
): Promise<SharedChunksBuildResult> {
    const logger = getLogger();
    logger.info('[Build] Building shared client chunks...');

    await fs.mkdir(outputDir, { recursive: true });

    const entries: Record<string, string> = {};
    for (const pkg of SHARED_PACKAGES) {
        const varName = pkg.replace('@jay-framework/', '').replace(/-/g, '_');
        const entryPath = path.join(outputDir, `_entry_${varName}.js`);
        await fs.writeFile(entryPath, `export * from '${pkg}';\n`);
        entries[varName] = entryPath;
    }

    await viteBuild({
        root: outputDir,
        build: {
            outDir: outputDir,
            emptyOutDir: false,
            minify: true,
            manifest: 'vite-manifest.json',
            rollupOptions: {
                input: entries,
                output: {
                    entryFileNames: '[name]-[hash].js',
                    chunkFileNames: 'chunks/[name]-[hash].js',
                    format: 'es',
                },
                treeshake: false,
            },
        },
        logLevel: 'warn',
    });

    for (const varName of Object.keys(entries)) {
        await fs.rm(path.join(outputDir, `_entry_${varName}.js`), { force: true });
    }

    const manifest = await parseViteManifest(outputDir);

    logger.info(`[Build] Shared chunks built: ${Object.keys(manifest).length} entries`);

    return { manifest, outputDir };
}

async function parseViteManifest(outputDir: string): Promise<Record<string, string>> {
    const viteManifestPath = path.join(outputDir, 'vite-manifest.json');
    const raw = JSON.parse(await fs.readFile(viteManifestPath, 'utf-8'));

    const manifest: Record<string, string> = {};
    for (const [key, entry] of Object.entries(raw) as [string, any][]) {
        if (!entry.isEntry) continue;
        const varName = path.basename(key, path.extname(key)).replace(/^_entry_/, '');
        const pkgName = `@jay-framework/${varName.replace(/_/g, '-')}`;
        manifest[pkgName] = entry.file;
    }

    const sharedManifestPath = path.join(outputDir, 'shared-manifest.json');
    await fs.writeFile(sharedManifestPath, JSON.stringify(manifest, null, 2));

    await fs.rm(viteManifestPath, { force: true });

    return manifest;
}
