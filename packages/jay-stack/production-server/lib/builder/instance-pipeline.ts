import { DevSlowlyChangingPhase, slowRenderInstances } from '@jay-framework/stack-server-runtime';
import type { JayRollupConfig } from '@jay-framework/compiler-jay-stack';
import type { JayRoute } from '@jay-framework/stack-route-scanner';
import type { InstanceEntry } from '../types';
import { loadProductionPageParts, buildPagePartsConfig } from './load-production-parts';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

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
    routeClientBundlePath?: string,
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
    const cachePath = path.join(backendInstanceDir, `${instanceId}.cache.json`);
    await fs.writeFile(
        cachePath,
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

    // 4. Client bundle is compiled per-route (DL#144), skip per-instance

    const instanceEntry: InstanceEntry = {
        params,
        cachePath: path.relative(ctx.backendDir, cachePath),
        serverElementPath: path.relative(ctx.backendDir, serverElementPath),
        clientBundlePath: routeClientBundlePath || '',
        clientCssPath: routeCssPath,
    };

    return { status: 'success', instanceEntry, slowViewState, carryForward, contracts };
}
