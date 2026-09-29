import chalk from 'chalk';
import YAML from 'yaml';
import path from 'node:path';
import fs from 'node:fs/promises';
import { setDevLogger, createDevLogger, getLogger, type LogLevel } from '@jay-framework/logger';

export interface ProductionContext {
    resolvedPath: string;
    pagesRoot: string;
    buildRoot: string;
    version: string;
    tsConfigFilePath: string;
    /** Site base URL from .jay config (site.baseUrl), used for sitemap generation. */
    siteBaseUrl?: string;
}

export async function resolveProductionContext(
    projectPath: string | undefined,
    versionOverride: string | undefined,
): Promise<ProductionContext> {
    const resolvedPath = path.resolve(projectPath || process.cwd());

    const jayConfigPath = path.join(resolvedPath, '.jay');
    let pagesBase = './src/pages';
    let siteBaseUrl: string | undefined;
    try {
        const jayConfig = YAML.parse(await fs.readFile(jayConfigPath, 'utf-8'));
        pagesBase = jayConfig?.devServer?.pagesBase || pagesBase;
        siteBaseUrl = jayConfig?.site?.baseUrl;
    } catch {
        // No .jay config, use defaults
    }

    const version = versionOverride || (await resolveVersionFromPackageJson(resolvedPath));

    return {
        resolvedPath,
        pagesRoot: path.resolve(resolvedPath, pagesBase),
        buildRoot: path.join(resolvedPath, 'build'),
        version,
        tsConfigFilePath: path.join(resolvedPath, 'tsconfig.json'),
        siteBaseUrl,
    };
}

export async function resolveVersionFromPackageJson(projectRoot: string): Promise<string> {
    try {
        const pkgJson = JSON.parse(
            await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'),
        );
        if (pkgJson.version) {
            return pkgJson.version;
        }
    } catch {
        // No package.json or no version field
    }
    return '1';
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

    // DL#189 — fail the build on jay-html validation errors (e.g. a phase-binding mismatch that
    // would render '' at SSR) before doing the expensive build work. The exit lives here (a real
    // call site) rather than inside surfaceValidationIssues so Rollup can't fold the gate away.
    const { surfaceValidationIssues } = await import('./run-validate');
    const valid = await surfaceValidationIssues(projectPath, { verbose: options.verbose });
    if (!valid) {
        process.exit(1);
    }

    const ctx = await resolveProductionContext(projectPath, options.version);

    // Generate type definitions (page.jay-html.d.ts + component .jay-contract.d.ts) so a fresh
    // checkout type-checks after a build — see DL#199.
    await generateDefinitionFiles(ctx);

    const { buildVersion } = await import('@jay-framework/production-build');
    await buildVersion({
        version: ctx.version,
        projectRoot: ctx.resolvedPath,
        pagesRoot: ctx.pagesRoot,
        buildRoot: ctx.buildRoot,
        concurrency: 4,
        tsConfigFilePath: ctx.tsConfigFilePath,
        minify: options.minify,
        siteBaseUrl: ctx.siteBaseUrl,
    });
}

/**
 * Generates all `.d.ts` files for a production build: `page.jay-html.d.ts` for every route page and
 * `<name>.jay-contract.d.ts` for every non-route contract (component/plugin), skipping the route
 * data contracts inlined into the page definitions. See DL#199.
 */
async function generateDefinitionFiles(ctx: ProductionContext): Promise<void> {
    const { glob } = await import('glob');
    const { generatePageDefinitionFiles } = await import('./generate-page-definition-files');
    const { generateContractDefinitionFiles } =
        await import('./generate-contract-definition-files');

    const jayHtmlPaths = await glob('**/page.jay-html', {
        cwd: ctx.pagesRoot,
        absolute: true,
        ignore: ['**/node_modules/**', '**/build/**', '**/dist/**'],
    });

    await generatePageDefinitionFiles(jayHtmlPaths, ctx.tsConfigFilePath, ctx.resolvedPath);
    await generateContractDefinitionFiles(path.resolve(ctx.resolvedPath, 'src'));
}

export async function runServe(
    projectPath: string | undefined,
    options: {
        version?: string;
        port: string;
        role: string;
        verbose?: boolean;
        testMode?: boolean;
        staticBaseUrl?: string;
        serveStatic?: boolean;
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
            siteBaseUrl: ctx.siteBaseUrl,
        });
    } else {
        const { startMainServer } = await import('@jay-framework/production-server');
        await startMainServer({
            buildRoot: ctx.buildRoot,
            version: ctx.version,
            port: parseInt(options.port, 10),
            testMode: options.testMode,
            publicBasePath: options.staticBaseUrl,
            serveStatic: options.serveStatic,
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
        siteBaseUrl: ctx.siteBaseUrl,
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
