import chalk from 'chalk';
import YAML from 'yaml';
import path from 'node:path';
import fs from 'node:fs/promises';
import { setDevLogger, createDevLogger, getLogger, type LogLevel } from '@jay-framework/logger';

export interface ProductionContext {
    resolvedPath: string;
    pagesRoot: string;
    buildRoot: string;
    version: number;
    tsConfigFilePath: string;
}

export async function resolveProductionContext(
    projectPath: string | undefined,
    versionOverride: string | undefined,
): Promise<ProductionContext> {
    const resolvedPath = path.resolve(projectPath || process.cwd());

    const jayConfigPath = path.join(resolvedPath, '.jay');
    let pagesBase = './src/pages';
    try {
        const jayConfig = YAML.parse(await fs.readFile(jayConfigPath, 'utf-8'));
        pagesBase = jayConfig?.devServer?.pagesBase || pagesBase;
    } catch {
        // No .jay config, use defaults
    }

    const version = versionOverride
        ? parseInt(versionOverride, 10)
        : await resolveVersionFromPackageJson(resolvedPath);

    return {
        resolvedPath,
        pagesRoot: path.resolve(resolvedPath, pagesBase),
        buildRoot: path.join(resolvedPath, 'build'),
        version,
        tsConfigFilePath: path.join(resolvedPath, 'tsconfig.json'),
    };
}

async function resolveVersionFromPackageJson(projectRoot: string): Promise<number> {
    try {
        const pkgJson = JSON.parse(
            await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'),
        );
        if (pkgJson.version) {
            const major = parseInt(pkgJson.version.split('.')[0], 10);
            const minor = parseInt(pkgJson.version.split('.')[1] || '0', 10);
            const patch = parseInt(pkgJson.version.split('.')[2] || '0', 10);
            return major * 10000 + minor * 100 + patch;
        }
    } catch {
        // No package.json or no version field
    }
    return 1;
}

export function initLogger(verbose?: boolean): void {
    const logLevel: LogLevel = verbose ? 'verbose' : 'info';
    setDevLogger(createDevLogger(logLevel));
}

export async function runBuild(
    projectPath: string | undefined,
    options: { version?: string; minify?: boolean; verbose?: boolean },
): Promise<void> {
    initLogger(options.verbose);

    const ctx = await resolveProductionContext(projectPath, options.version);

    const { buildVersion } = await import('@jay-framework/production-server');
    await buildVersion({
        version: ctx.version,
        projectRoot: ctx.resolvedPath,
        pagesRoot: ctx.pagesRoot,
        buildRoot: ctx.buildRoot,
        concurrency: 4,
        tsConfigFilePath: ctx.tsConfigFilePath,
        minify: options.minify,
    });
}

export async function runServe(
    projectPath: string | undefined,
    options: {
        version?: string;
        port: string;
        role: string;
        verbose?: boolean;
        testMode?: boolean;
    },
): Promise<void> {
    initLogger(options.verbose);

    const ctx = await resolveProductionContext(projectPath, options.version);

    if (options.role === 'renderer') {
        const { startRendererServer } = await import('@jay-framework/production-server');
        await startRendererServer({
            buildRoot: ctx.buildRoot,
            version: ctx.version,
            port: parseInt(options.port, 10),
            projectRoot: ctx.resolvedPath,
            pagesRoot: ctx.pagesRoot,
            tsConfigFilePath: ctx.tsConfigFilePath,
        });
    } else {
        const { startMainServer } = await import('@jay-framework/production-server');
        await startMainServer({
            buildRoot: ctx.buildRoot,
            version: ctx.version,
            port: parseInt(options.port, 10),
            testMode: options.testMode,
        });
    }
}

export async function runRebuild(
    projectPath: string | undefined,
    options: {
        contract?: string;
        route?: string;
        url?: string;
        params?: string;
        version?: string;
        verbose?: boolean;
    },
): Promise<void> {
    initLogger(options.verbose);

    const ctx = await resolveProductionContext(projectPath, options.version);

    let params: Record<string, string> | undefined;
    if (options.params) {
        params = JSON.parse(options.params);
    }

    const { rebuild } = await import('@jay-framework/production-server');
    type RebuildTarget = import('@jay-framework/production-server').RebuildTarget;

    let target: RebuildTarget;
    if (options.contract) {
        target = { mode: 'contract', contractName: options.contract, params };
    } else if (options.route) {
        target = { mode: 'route', routePattern: options.route, params };
    } else if (options.url) {
        target = { mode: 'url', url: options.url };
    } else {
        getLogger().error(chalk.red('One of --contract, --route, or --url is required'));
        process.exit(1);
    }

    const result = await rebuild({
        projectRoot: ctx.resolvedPath,
        pagesRoot: ctx.pagesRoot,
        buildRoot: ctx.buildRoot,
        version: ctx.version,
        target,
        tsConfigFilePath: ctx.tsConfigFilePath,
    });

    if (result.errors.length > 0) {
        for (const err of result.errors) {
            getLogger().error(
                chalk.red(`  Error: ${err.route} ${JSON.stringify(err.params)}: ${err.error}`),
            );
        }
        process.exit(1);
    }
}
