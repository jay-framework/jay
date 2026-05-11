import { build as viteBuild } from 'vite';
import { jayStackCompiler, type JayRollupConfig } from '@jay-framework/compiler-jay-stack';
import { scanRoutes, type JayRoute } from '@jay-framework/stack-route-scanner';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

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
            const entryName = relativePath
                .replace(/^src\//, '')
                .replace(/\.ts$/, '');
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

    // Discover local plugin component files (headless components)
    const pluginsDir = path.join(projectRoot, 'src', 'plugins');
    try {
        const pluginDirs = await fs.readdir(pluginsDir, { withFileTypes: true });
        for (const dir of pluginDirs) {
            if (!dir.isDirectory()) continue;
            const pluginDir = path.join(pluginsDir, dir.name);
            const pluginFiles = await fs.readdir(pluginDir);
            for (const file of pluginFiles) {
                if (file.endsWith('.ts') && file !== 'init.ts' && file !== 'page.ts') {
                    const entryName = `plugins/${dir.name}/${file.replace(/\.ts$/, '')}`;
                    pages[entryName] = path.join(pluginDir, file);
                }
            }
        }
    } catch {
        // No plugins directory
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
