import { build as viteBuild } from 'vite';
import { getLogger } from '@jay-framework/logger';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);

export interface SharedChunksBuildResult {
    manifest: Record<string, string>;
    outputDir: string;
}

const FRAMEWORK_PACKAGES = [
    '@jay-framework/stack-client-runtime',
    '@jay-framework/component',
    '@jay-framework/reactive',
    '@jay-framework/runtime',
    '@jay-framework/view-state-merge',
    '@jay-framework/fullstack-component',
];

export async function buildSharedChunks(
    outputDir: string,
    _projectRoot: string,
    minify: boolean = true,
    pluginClientPackages: string[] = [],
): Promise<SharedChunksBuildResult> {
    const logger = getLogger();
    logger.info('[Build] Building shared client chunks...');

    await fs.mkdir(outputDir, { recursive: true });

    const allPackages = [...FRAMEWORK_PACKAGES, ...pluginClientPackages];

    const entries: Record<string, string> = {};
    for (const pkg of allPackages) {
        const varName = pkgToVarName(pkg);
        const entryPath = path.join(outputDir, `_shared_${varName}.js`);
        await fs.writeFile(entryPath, `export * from '${pkg}';\n`);
        entries[varName] = entryPath;
    }
    const dedupePackages = [...allPackages, '@jay-framework/list-compare'];

    await viteBuild({
        build: {
            outDir: outputDir,
            emptyOutDir: true,
            minify,
            manifest: 'vite-manifest.json',
            rollupOptions: {
                input: entries,
                output: {
                    entryFileNames: '[name]-[hash].js',
                    chunkFileNames: '[name]-[hash].js',
                    format: 'es',
                },
                preserveEntrySignatures: 'exports-only',
            },
        },
        resolve: {
            dedupe: dedupePackages,
        },
        logLevel: 'warn',
    });

    for (const pkg of allPackages) {
        const varName = pkgToVarName(pkg);
        await fs.rm(path.join(outputDir, `_shared_${varName}.js`), { force: true });
    }

    const manifest = await parseViteManifest(outputDir, allPackages);

    logger.info(`[Build] Shared chunks built: ${Object.keys(manifest).length} entries`);

    return { manifest, outputDir };
}

function pkgToVarName(pkg: string): string {
    return pkg.replace('@jay-framework/', '').replace(/[/-]/g, '_');
}

async function parseViteManifest(
    outputDir: string,
    packages: string[],
): Promise<Record<string, string>> {
    const viteManifestPath = path.join(outputDir, 'vite-manifest.json');
    const raw = JSON.parse(await fs.readFile(viteManifestPath, 'utf-8'));

    const varNameToPackage = new Map<string, string>();
    for (const pkg of packages) {
        varNameToPackage.set(pkgToVarName(pkg), pkg);
    }

    const manifest: Record<string, string> = {};
    for (const [, entry] of Object.entries(raw) as [string, any][]) {
        if (!entry.isEntry) continue;
        const outputBase = path.basename(entry.file as string, '.js');
        for (const [varName, pkg] of varNameToPackage) {
            if (outputBase.startsWith(varName)) {
                manifest[pkg] = entry.file;
                break;
            }
        }
    }

    const sharedManifestPath = path.join(outputDir, 'shared-manifest.json');
    await fs.writeFile(sharedManifestPath, JSON.stringify(manifest, null, 2));
    await fs.rm(viteManifestPath, { force: true });

    return manifest;
}
