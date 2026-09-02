import { build as viteBuild } from 'vite';
import { jayStackCompiler, type JayRollupConfig } from '@jay-framework/compiler-jay-stack';
import { scanRoutes, type JayRoute } from '@jay-framework/stack-route-scanner';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

function isCompilableTypeScriptFile(fileName: string): boolean {
    return fileName.endsWith('.ts') && !fileName.endsWith('.d.ts') && fileName !== 'page.ts';
}

/**
 * Recursively collect compilable TypeScript files under a directory.
 * Entry names mirror paths relative to src/ (e.g. components/site-header, plugins/foo/lib/init).
 */
async function collectTypeScriptEntries(
    rootDir: string,
    entryPrefix: string,
    pages: Record<string, string>,
): Promise<void> {
    async function walk(currentDir: string, relativePath: string): Promise<void> {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                const nextRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
                await walk(fullPath, nextRelative);
                continue;
            }
            if (!isCompilableTypeScriptFile(entry.name)) continue;
            const stem = entry.name.replace(/\.ts$/, '');
            const entryName = relativePath
                ? `${entryPrefix}/${relativePath}/${stem}`
                : `${entryPrefix}/${stem}`;
            pages[entryName] = fullPath;
        }
    }

    await walk(rootDir, '');
}

export interface ServerBuildEntries {
    init?: string;
    pages: Record<string, string>;
    actions: Record<string, string>;
}

export interface ServerBuildResult {
    entries: ServerBuildEntries;
    routes: JayRoute[];
    outputDir: string;
}

export async function discoverServerEntries(
    projectRoot: string,
    pagesRoot: string,
): Promise<{ entries: ServerBuildEntries; routes: JayRoute[] }> {
    const logger = getLogger();

    const routes = await scanRoutes(pagesRoot, {
        jayHtmlFilename: 'page.jay-html',
        compFilename: 'page.ts',
    });

    const pages: Record<string, string> = {};
    for (const route of routes) {
        if (route.compPath) {
            const relativePath = path.relative(projectRoot, route.compPath);
            const entryName = relativePath.replace(/^src\//, '').replace(/\.ts$/, '');
            pages[entryName] = route.compPath;
        }
    }

    const actions: Record<string, string> = {};
    const actionsDir = path.join(projectRoot, 'src', 'actions');
    try {
        const files = await fs.readdir(actionsDir);
        for (const file of files) {
            if (file.endsWith('.actions.ts')) {
                const entryName = 'actions/' + file.replace(/\.ts$/, '');
                actions[entryName] = path.join(actionsDir, file);
            }
        }
    } catch {
        // No actions directory
    }

    // Discover local plugin and component TypeScript (headless/headfull components).
    // Plugins: recurse into src/plugins/{name}/lib/** (package layout).
    // Components: flat files in src/components/*.ts and nested subdirs.
    for (const subDir of ['plugins', 'components']) {
        const scanDir = path.join(projectRoot, 'src', subDir);
        try {
            const entries = await fs.readdir(scanDir, { withFileTypes: true });
            for (const entry of entries) {
                const entryPath = path.join(scanDir, entry.name);
                if (entry.isDirectory()) {
                    await collectTypeScriptEntries(entryPath, `${subDir}/${entry.name}`, pages);
                    continue;
                }
                if (!isCompilableTypeScriptFile(entry.name)) continue;
                const stem = entry.name.replace(/\.ts$/, '');
                pages[`${subDir}/${stem}`] = entryPath;
            }
        } catch {
            // Directory may not exist
        }
    }

    let init: string | undefined;
    const initPaths = [
        path.join(projectRoot, 'src', 'lib', 'init.ts'),
        path.join(projectRoot, 'src', 'init.ts'),
    ];
    for (const initPath of initPaths) {
        try {
            await fs.access(initPath);
            init = initPath;
            break;
        } catch {
            // Try next
        }
    }

    const entries: ServerBuildEntries = { init, pages, actions };

    logger.info(
        `[Build] Discovered: ${Object.keys(pages).length} pages, ${Object.keys(actions).length} actions, init: ${init ? 'yes' : 'no'}`,
    );

    return { entries, routes };
}

export async function buildServerCode(
    entries: ServerBuildEntries,
    jayOptions: JayRollupConfig,
    outputDir: string,
    projectRoot: string,
): Promise<void> {
    const logger = getLogger();
    logger.info('[Build] Compiling server code...');

    const input: Record<string, string> = {};

    if (entries.init) {
        input['init'] = entries.init;
    }

    for (const [name, filePath] of Object.entries(entries.pages)) {
        input[name] = filePath;
    }

    for (const [name, filePath] of Object.entries(entries.actions)) {
        input[name] = filePath;
    }

    if (Object.keys(input).length === 0) {
        logger.info('[Build] No server entries to compile');
        return;
    }

    await viteBuild({
        root: projectRoot,
        publicDir: false,
        plugins: [...jayStackCompiler(jayOptions)],
        build: {
            ssr: true,
            outDir: outputDir,
            emptyOutDir: true,
            minify: false,
            rollupOptions: {
                input,
                external: [
                    /^node:/,
                    /^@jay-framework\//,
                    // Plugin packages are pre-compiled, externalize them
                    /^@wix\//,
                ],
                output: {
                    entryFileNames: '[name].js',
                    chunkFileNames: 'chunks/[name]-[hash].js',
                    format: 'es',
                },
            },
        },
        logLevel: 'warn',
    });

    logger.info(`[Build] Server code compiled to ${outputDir}`);
}
