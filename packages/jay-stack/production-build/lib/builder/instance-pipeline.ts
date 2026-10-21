import {
    DevSlowlyChangingPhase,
    slowRenderInstances,
    mergeFreshness,
    resolveFreshness,
    type FreshnessInput,
} from '@jay-framework/stack-server-runtime';
import type { JayRollupConfig } from '@jay-framework/compiler-jay-stack';
import type { JayRoute } from '@jay-framework/stack-route-scanner';
import {
    deriveCachePath,
    serializeCacheEntry,
    type InstanceEntry,
} from '@jay-framework/production-server';
import { loadProductionPageParts, buildPagePartsConfig } from './load-production-parts';
import { buildUrl } from './param-routing';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

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

    // Write page-parts.json (DL#137) — always overwrite to pick up import changes
    const pagePartsConfigPath = path.join(backendInstanceDir, 'page-parts.json');
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

    // Concrete URL for this instance, so slow-phase bindings like {jay.url.path}
    // resolve to the real path instead of '' (DL#163).
    const pageUrl = buildUrl(route, params);

    // 1. Slow render (page + keyed headless components)
    const slowPhase = new DevSlowlyChangingPhase();
    const slowResult = await slowPhase.runSlowlyForPage(
        params,
        { language: 'en', url: pageUrl },
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
    let instanceFreshness: FreshnessInput = {};

    // 2. Slow-render static headless instances (DL#144)
    // Static instances (outside forEach) are discovered from the original jay-html
    // by loadProductionPageParts. forEach instances are handled at serve time.
    if (
        pageParts.discoveredInstances.length > 0 &&
        pageParts.headlessInstanceComponents.length > 0
    ) {
        const instanceSlowResult = await slowRenderInstances(
            pageParts.discoveredInstances,
            pageParts.headlessInstanceComponents,
            {
                pageViewState: slowViewState,
                pageParams: params,
                pageProps: { language: 'en', url: pageUrl },
            },
        );

        if (instanceSlowResult) {
            instanceFreshness = instanceSlowResult.freshness;
            const existingInstances = (carryForward as any).__instances || {
                discovered: [],
                carryForwards: {},
            };
            (carryForward as any).__instances = {
                discovered: [
                    ...existingInstances.discovered,
                    ...instanceSlowResult.instancePhaseData.discovered,
                ],
                carryForwards: {
                    ...existingInstances.carryForwards,
                    ...instanceSlowResult.instancePhaseData.carryForwards,
                },
                slowViewStates: {
                    ...(existingInstances.slowViewStates || {}),
                    ...(instanceSlowResult.instancePhaseData as any).slowViewStates,
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

    // Write cache data for the main server (backend) at the deterministic path (DL#227). The file
    // carries `route` + `params` (its own index entry) and `renderedAt` / `ttl` / `grace` (DL#226).
    const freshness = resolveFreshness(
        mergeFreshness([{ ttl: slowResult.ttl, grace: slowResult.grace }, instanceFreshness]),
    );
    // DL#227: an instance's identity is the params SERVE extracts from the URL — i.e. the route's
    // dynamic `[segment]` params only. Inferred params (a static override of a dynamic route, e.g.
    // `/products/ceramic-flower-vase` shadowing `/products/[slug]`) and inline headless props are
    // render inputs, not key dimensions. Keying by the full `params` here wrote the cache under
    // `page_<hash(slug)>.cache.json`, but the static route matches at serve with `{}` →
    // `page.cache.json`, so `getInstance` missed it and render-on-miss served an instance-less page
    // (no site-header / cart data). Key by the URL-visible params so build and serve agree.
    const dynamicParamNames = new Set(
        route.segments
            .filter(
                (s): s is Extract<JayRoute['segments'][number], { name: string }> =>
                    typeof s !== 'string',
            )
            .map((s) => s.name),
    );
    const urlParams = Object.fromEntries(
        Object.entries(params).filter(([k]) => dynamicParamNames.has(k)),
    );
    const cachePath = path.join(ctx.backendDir, deriveCachePath(route.rawRoute, urlParams));
    await fs.writeFile(
        cachePath,
        serializeCacheEntry({ pattern: route.rawRoute }, urlParams, {
            slowViewState,
            carryForward,
            renderedAt: Date.now(),
            ...(freshness.ttl !== undefined && { ttl: freshness.ttl }),
            ...(freshness.grace !== undefined && { grace: freshness.grace }),
        }),
        'utf-8',
    );
    const instanceId = path.basename(cachePath, '.cache.json');

    logger.info(`[Build] Instance data: ${routeDir}/${instanceId}`);

    // 3. Server element is compiled per-route (DL#144), skip per-instance
    const serverElementPath = routeServerElementPath
        ? path.join(ctx.backendDir, routeServerElementPath)
        : path.join(backendInstanceDir, `${instanceId}.server-element.js`);
    let serverElementResult: { cssFile?: string } = {};

    // 4. Client bundle is compiled per-route (DL#144), skip per-instance

    const instanceEntry: InstanceEntry = {
        params: urlParams,
        cachePath: path.relative(ctx.backendDir, cachePath),
        serverElementPath: path.relative(ctx.backendDir, serverElementPath),
        clientBundlePath: routeClientBundlePath || '',
        clientCssPath: routeCssPath,
    };

    return { status: 'success', instanceEntry, slowViewState, carryForward, contracts };
}
