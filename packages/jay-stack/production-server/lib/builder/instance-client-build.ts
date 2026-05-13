import { build as viteBuild } from 'vite';
import { jayStackCompiler, type JayRollupConfig } from '@jay-framework/compiler-jay-stack';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface InstanceClientBuildResult {
    jsFile: string;
    cssFile?: string;
}

export async function buildInstanceClient(
    hydrateEntryPath: string,
    instanceId: string,
    outputDir: string,
    projectRoot: string,
    jayOptions: JayRollupConfig,
    minify: boolean = true,
): Promise<InstanceClientBuildResult> {
    const logger = getLogger();

    await fs.mkdir(outputDir, { recursive: true });

    await viteBuild({
        root: projectRoot,
        plugins: [...jayStackCompiler(jayOptions)],
        build: {
            outDir: outputDir,
            emptyOutDir: false,
            minify,
            manifest: `${instanceId}-manifest.json`,
            rollupOptions: {
                input: { [instanceId]: hydrateEntryPath },
                external: [
                    '@jay-framework/stack-client-runtime',
                    '@jay-framework/component',
                    '@jay-framework/reactive',
                    '@jay-framework/runtime',
                    '@jay-framework/view-state-merge',
                    '@jay-framework/fullstack-component',
                ],
                output: {
                    entryFileNames: '[name]-[hash].js',
                    chunkFileNames: 'chunks/[name]-[hash].js',
                    assetFileNames: '[name]-[hash].[ext]',
                    format: 'es',
                },
                preserveEntrySignatures: 'exports-only',
            },
        },
        logLevel: 'warn',
    });

    const manifestPath = path.join(outputDir, `${instanceId}-manifest.json`);
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    await fs.rm(manifestPath, { force: true });

    const entryKey = Object.keys(manifest).find((k) => (manifest[k] as any).isEntry);
    if (!entryKey) {
        throw new Error(`No entry found in instance build manifest for ${instanceId}`);
    }

    const entry = manifest[entryKey] as { file: string; css?: string[] };

    const result: InstanceClientBuildResult = {
        jsFile: entry.file,
        cssFile: entry.css?.[0],
    };

    logger.info(`[Build] Client bundle: ${result.jsFile}`);

    return result;
}
