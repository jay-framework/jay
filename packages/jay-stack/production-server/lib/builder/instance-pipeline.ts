import { DevSlowlyChangingPhase, slowRenderInstances } from '@jay-framework/stack-server-runtime';
import type { JayRollupConfig } from '@jay-framework/compiler-jay-stack';
import type { JayRoute } from '@jay-framework/stack-route-scanner';
import type { InstanceEntry } from '../types';
import { loadProductionPageParts, buildPagePartsConfig } from './load-production-parts';
import { generateHydrationEntry } from './hydration-entry-gen';
import { buildInstanceClient } from './instance-client-build';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

import fsSync from 'node:fs';

function resolvePackageNameForRoute(compPath: string): string | undefined {
    const dir = path.dirname(compPath);
    for (const candidate of [dir, path.join(dir, '..')]) {
        try {
            const pkgJson = JSON.parse(
                fsSync.readFileSync(path.join(candidate, 'package.json'), 'utf-8'),
            );
            if (pkgJson.name) return pkgJson.name;
        } catch {
            /* skip */
        }
    }
    return undefined;
}

export interface ClientInitEntry {
    modulePath: string;
    exportName: string;
    key: string;
}

export interface InstanceBuildContext {
    projectRoot: string;
    pagesRoot: string;
    buildDir: string;
    backendDir: string;
    frontendDir: string;
    jayOptions: JayRollupConfig;
    tsConfigFilePath?: string;
    minify?: boolean;
    clientInits?: ClientInitEntry[];
    /** When set, appended to instance ID hash to produce unique filenames per rebuild. */
    rebuildSuffix?: string;
}

export type InstanceBuildResult =
    | {
          status: 'success';
          instanceEntry: InstanceEntry;
          slowViewState: object;
          carryForward: object;
          contracts: string[];
      }
    | { status: 'skipped'; reason: string };

function hashParams(params: Record<string, string>, suffix?: string): string {
    const sorted = Object.keys(params)
        .sort()
        .reduce(
            (acc, key) => {
                acc[key] = params[key];
                return acc;
            },
            {} as Record<string, string>,
        );
    const json = JSON.stringify(sorted);
    if (json === '{}' && !suffix) return '';
    const input = suffix ? json + ':' + suffix : json;
    return '_' + crypto.createHash('md5').update(input).digest('hex').substring(0, 8);
}

export async function buildInstance(
    route: JayRoute,
    params: Record<string, string>,
    pageModule: any,
    ctx: InstanceBuildContext,
    routeServerElementPath?: string,
    routeCssPath?: string,
    routeHydratePath?: string,
): Promise<InstanceBuildResult> {
    const logger = getLogger();
    const routeDir = route.rawRoute.replace(/^\//, '') || 'index';
    const paramHash = hashParams(params, ctx.rebuildSuffix);
    const instanceId = `page${paramHash}`;
    const backendInstanceDir = path.join(ctx.backendDir, 'pre-rendered', routeDir);
    const frontendInstanceDir = path.join(ctx.frontendDir, 'pages', routeDir);

    await fs.mkdir(backendInstanceDir, { recursive: true });
    await fs.mkdir(frontendInstanceDir, { recursive: true });

    const jayHtmlContent = await fs.readFile(route.jayHtmlPath, 'utf-8');
    const sourceDir = path.dirname(route.jayHtmlPath);

    // Load page parts including headless components
    const serverBuildDir = path.join(ctx.backendDir, 'server');
    const pageParts = await loadProductionPageParts(
        route,
        pageModule,
        jayHtmlContent,
        ctx.projectRoot,
        ctx.tsConfigFilePath,
        serverBuildDir,
    );

    // Collect contract names used by this route (for invalidation resolution)
    const contracts = [
        ...new Set([
            ...pageParts.headlessInstanceComponents.map((c) => c.contractName),
            ...pageParts.parts
                .filter((p) => p.contractInfo?.contractName)
                .map((p) => p.contractInfo!.contractName),
        ]),
    ];

    // Write page-parts.json (DL#137) — once per route, first instance writes it
    const pagePartsConfigPath = path.join(backendInstanceDir, 'page-parts.json');
    try {
        await fs.access(pagePartsConfigPath);
    } catch {
        const exportName = (route as any).componentExport || 'page';
        let pageServerModule = '';
        let pageIsPlugin = false;
        if (route.compPath) {
            if (route.componentExport) {
                pageServerModule = route.packageName || route.compPath;
                pageIsPlugin = true;
            } else {
                const relativePath = path.relative(ctx.projectRoot, route.compPath);
                pageServerModule = relativePath
                    .replace(/^src\//, 'server/')
                    .replace(/\.ts$/, '.js')
                    .replace(/\[/g, '_')
                    .replace(/\]/g, '_');
            }
        }
        const config = buildPagePartsConfig(
            pageParts,
            pageServerModule,
            exportName,
            ctx.backendDir,
            pageIsPlugin,
        );
        await fs.writeFile(pagePartsConfigPath, JSON.stringify(config, null, 2));
        logger.info(`[Build] Page parts config: ${routeDir}/page-parts.json`);
    }

    // 1. Slow render (page + keyed headless components)
    const slowPhase = new DevSlowlyChangingPhase();
    const slowResult = await slowPhase.runSlowlyForPage(
        params,
        { params },
        pageParts.parts,
        pageParts.discoveredInstances,
        pageParts.headlessInstanceComponents,
        route.jayHtmlPath,
    );

    if (slowResult.kind !== 'PhaseOutput') {
        if (slowResult.kind === 'ClientError' || slowResult.kind === 'Redirect') {
            return {
                status: 'skipped',
                reason: `${slowResult.kind} ${(slowResult as any).status ?? ''} ${(slowResult as any).message ?? ''}`.trim(),
            };
        }
        throw new Error(
            `Slow render failed for ${route.rawRoute} with params ${JSON.stringify(params)}: ${slowResult.kind}`,
        );
    }

    const slowViewState = slowResult.rendered;
    const carryForward = slowResult.carryForward;

    // 2. Slow-render static headless instances (DL#144)
    // Static instances (outside forEach) are discovered from the original jay-html
    // by loadProductionPageParts. forEach instances are handled at serve time.
    if (
        pageParts.discoveredInstances.length > 0 &&
        pageParts.headlessInstanceComponents.length > 0
    ) {
        const slowResult = await slowRenderInstances(
            pageParts.discoveredInstances,
            pageParts.headlessInstanceComponents,
        );

        if (slowResult) {
            const existingInstances = (carryForward as any).__instances || {
                discovered: [],
                carryForwards: {},
            };
            (carryForward as any).__instances = {
                discovered: [
                    ...existingInstances.discovered,
                    ...slowResult.instancePhaseData.discovered,
                ],
                carryForwards: {
                    ...existingInstances.carryForwards,
                    ...slowResult.instancePhaseData.carryForwards,
                },
                slowViewStates: {
                    ...(existingInstances.slowViewStates || {}),
                    ...(slowResult.instancePhaseData as any).slowViewStates,
                },
            };
        }
    }

    // Store forEach instances in carryForward for serve-time processing
    if (pageParts.forEachInstances.length > 0) {
        const existingInstances = (carryForward as any).__instances || {
            discovered: [],
            carryForwards: {},
        };
        existingInstances.forEachInstances = pageParts.forEachInstances;
        (carryForward as any).__instances = existingInstances;
    }

    // Write cache metadata for the main server (backend)
    // The .jay-html stub is written alongside so readPreRenderedHtml can find the .cache.json.
    const preRenderedPath = path.join(backendInstanceDir, `${instanceId}.jay-html`);
    const cacheMetadataPath = path.join(backendInstanceDir, `${instanceId}.cache.json`);
    await fs.writeFile(preRenderedPath, '', 'utf-8');
    await fs.writeFile(
        cacheMetadataPath,
        JSON.stringify({
            slowViewState,
            carryForward,
        }),
        'utf-8',
    );

    logger.info(`[Build] Instance data: ${routeDir}/${instanceId}`);

    // 3. Server element is compiled per-route (DL#144), skip per-instance
    const serverElementPath = routeServerElementPath
        ? path.join(ctx.backendDir, routeServerElementPath)
        : path.join(backendInstanceDir, `${instanceId}.server-element.js`);
    let serverElementResult: { cssFile?: string } = {};

    // 4. Generate hydration entry (temporary, in backend dir for compilation)
    const hydrateEntryPath = path.join(backendInstanceDir, `${instanceId}.hydrate-entry.ts`);

    // For NPM plugin routes, use /client entry + component export name
    let pageModulePath: string;
    let pageExportName: string;
    if (route.componentExport) {
        const pkgName = resolvePackageNameForRoute(route.compPath!);
        pageModulePath = pkgName
            ? `${pkgName}/client`
            : './' + path.relative(backendInstanceDir, route.compPath!);
        pageExportName = route.componentExport;
    } else if (route.compPath) {
        pageModulePath = './' + path.relative(backendInstanceDir, route.compPath);
        pageExportName = 'page';
    } else {
        pageModulePath = '';
        pageExportName = '';
    }

    if (pageParts.keyedPartModules.length > 0) {
        logger.info(
            `[Build] Keyed parts for ${routeDir}: ${pageParts.keyedPartModules.map((p) => p.key).join(', ')}`,
        );
    }

    const ROUTE_HYDRATE_KEY = 'jay-route-hydrate';
    await generateHydrationEntry({
        jayHtmlPath: './' + path.relative(backendInstanceDir, route.jayHtmlPath),
        pageModulePath,
        pageExportName,
        slowViewState,
        trackByMap: pageParts.clientTrackByMap || {},
        outputPath: hydrateEntryPath,
        keyedParts: pageParts.keyedPartModules,
        clientInits: ctx.clientInits,
        routeHydrateImport: routeHydratePath ? ROUTE_HYDRATE_KEY : undefined,
    });

    // 5. Per-instance Vite build → frontend/pages/
    const clientResult = await buildInstanceClient(
        hydrateEntryPath,
        instanceId,
        frontendInstanceDir,
        ctx.projectRoot,
        ctx.jayOptions,
        ctx.minify ?? true,
        ctx.pagesRoot,
        ctx.buildDir,
    );

    await fs.rm(hydrateEntryPath, { force: true });

    // Move CSS from server element compile (if any) to frontend
    const cssFile = clientResult.cssFile || serverElementResult.cssFile;
    if (serverElementResult.cssFile && !clientResult.cssFile) {
        const srcCss = path.join(backendInstanceDir, serverElementResult.cssFile);
        const dstCss = path.join(frontendInstanceDir, serverElementResult.cssFile);
        try {
            await fs.rename(srcCss, dstCss);
        } catch {
            await fs.copyFile(srcCss, dstCss);
            await fs.rm(srcCss, { force: true });
        }
    }

    const instanceCssPath = cssFile
        ? path.relative(ctx.frontendDir, path.join(frontendInstanceDir, cssFile))
        : routeCssPath;

    const instanceEntry: InstanceEntry = {
        params,
        preRenderedPath: path.relative(ctx.backendDir, preRenderedPath),
        serverElementPath: path.relative(ctx.backendDir, serverElementPath),
        clientBundlePath: path.relative(
            ctx.frontendDir,
            path.join(frontendInstanceDir, clientResult.jsFile),
        ),
        clientCssPath: instanceCssPath,
    };

    return { status: 'success', instanceEntry, slowViewState, carryForward, contracts };
}
