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
    _projectRoot: string,
    minify: boolean = true,
): Promise<SharedChunksBuildResult> {
    const logger = getLogger();
    logger.info('[Build] Building shared client chunks...');

    await fs.mkdir(outputDir, { recursive: true });

    // Create wrapper entry files that import by package name.
    // This ensures Rollup deduplicates packages through its normal resolution.
    const entries: Record<string, string> = {};
    for (const pkg of SHARED_PACKAGES) {
        const varName = pkg.replace('@jay-framework/', '').replace(/-/g, '_');
        const entryPath = path.join(outputDir, `_entry_${varName}.js`);
        await fs.writeFile(entryPath, `export * from '${pkg}';\n`);
        entries[varName] = entryPath;
    }
    const dedupePackages = [...SHARED_PACKAGES, '@jay-framework/list-compare'];

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

    // Clean up wrapper entry files
    for (const pkg of SHARED_PACKAGES) {
        const varName = pkg.replace('@jay-framework/', '').replace(/-/g, '_');
        await fs.rm(path.join(outputDir, `_entry_${varName}.js`), { force: true });
    }

    const manifest = await parseViteManifest(outputDir);

    logger.info(`[Build] Shared chunks built: ${Object.keys(manifest).length} entries`);

    return { manifest, outputDir };
}

function resolvePackageSource(pkg: string): string {
    const pkgJsonPath = path.join(path.dirname(require.resolve(pkg)), '..', 'package.json');

    try {
        const pkgDir = path.dirname(pkgJsonPath);
        const libIndex = path.join(pkgDir, 'lib', 'index.ts');
        if (require('fs').existsSync(libIndex)) {
            return libIndex;
        }
        return require.resolve(pkg);
    } catch {
        return require.resolve(pkg);
    }
}

async function parseViteManifest(outputDir: string): Promise<Record<string, string>> {
    const viteManifestPath = path.join(outputDir, 'vite-manifest.json');
    const raw = JSON.parse(await fs.readFile(viteManifestPath, 'utf-8'));

    const varNameToPackage = new Map<string, string>();
    for (const pkg of SHARED_PACKAGES) {
        const varName = pkg.replace('@jay-framework/', '').replace(/-/g, '_');
        varNameToPackage.set(varName, pkg);
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
