import {
    slowRenderTransform,
    parseContract,
    JAY_IMPORT_RESOLVER,
    injectHeadfullFSTemplates,
    discoverHeadlessInstances,
    assignCoordinatesToJayHtml,
    resolveHeadlessInstances,
} from '@jay-framework/compiler-jay-html';
import { DevSlowlyChangingPhase, slowRenderInstances } from '@jay-framework/stack-server-runtime';
import type { JayRollupConfig } from '@jay-framework/compiler-jay-stack';
import type { JayRoute } from '@jay-framework/stack-route-scanner';
import type { Contract } from '@jay-framework/compiler-jay-html';
import type { InstanceEntry } from '../types';
import { loadProductionPageParts } from './load-production-parts';
import { compileServerElement } from './server-element-compile';
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
    jayOptions: JayRollupConfig;
    tsConfigFilePath?: string;
    minify?: boolean;
    clientInits?: ClientInitEntry[];
}

export type InstanceBuildResult =
    | { status: 'success'; instanceEntry: InstanceEntry; slowViewState: object; carryForward: object }
    | { status: 'skipped'; reason: string };

function hashParams(params: Record<string, string>): string {
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
    if (json === '{}') return '';
    return '_' + crypto.createHash('md5').update(json).digest('hex').substring(0, 8);
}

export async function buildInstance(
    route: JayRoute,
    params: Record<string, string>,
    pageModule: any,
    ctx: InstanceBuildContext,
): Promise<InstanceBuildResult> {
    const logger = getLogger();
    const routeDir = route.rawRoute.replace(/^\//, '') || 'index';
    const paramHash = hashParams(params);
    const instanceId = `page${paramHash}`;
    const instanceDir = path.join(ctx.buildDir, 'pre-rendered', routeDir);

    await fs.mkdir(instanceDir, { recursive: true });

    const jayHtmlContent = await fs.readFile(route.jayHtmlPath, 'utf-8');
    const sourceDir = path.dirname(route.jayHtmlPath);

    // Load page parts including headless components
    const serverBuildDir = path.join(ctx.buildDir, 'server');
    const pageParts = await loadProductionPageParts(
        route,
        pageModule,
        jayHtmlContent,
        ctx.projectRoot,
        ctx.tsConfigFilePath,
        serverBuildDir,
    );

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

    // 2. Pre-render jay-html (Pass 1: page bindings)
    let contract: Contract | undefined;
    const contractPath = route.jayHtmlPath.replace('.jay-html', '.jay-contract');
    try {
        const contractContent = await fs.readFile(contractPath, 'utf-8');
        const parseResult = parseContract(contractContent, path.basename(contractPath));
        if (parseResult.val) contract = parseResult.val;
    } catch {
        // No contract file
    }

    const jayHtmlWithTemplates = injectHeadfullFSTemplates(
        jayHtmlContent,
        sourceDir,
        JAY_IMPORT_RESOLVER,
    );

    const transformResult = slowRenderTransform({
        jayHtmlContent: jayHtmlWithTemplates,
        slowViewState: slowViewState as Record<string, unknown>,
        contract,
        headlessContracts: pageParts.headlessContracts,
        sourceDir,
        importResolver: JAY_IMPORT_RESOLVER,
    });

    if (!transformResult.val) {
        throw new Error(
            `Slow render transform failed for ${route.rawRoute}: ${transformResult.validations.join(', ')}`,
        );
    }

    let preRenderedJayHtml = transformResult.val.preRenderedJayHtml;

    // Pass 2: Headless instance bindings (same as dev server's preRenderJayHtml)
    // After Pass 1, the jay-html still has <jay:xxx> tags — including unrolled
    // slowForEach instances. We discover and slow-render ALL instances here.
    if (pageParts.headlessInstanceComponents.length > 0) {
        const discoveryResult = discoverHeadlessInstances(preRenderedJayHtml);
        const htmlWithRefs = discoveryResult.preRenderedJayHtml;
        const contractNames = new Set(
            pageParts.headlessInstanceComponents.map((c) => c.contractName),
        );
        preRenderedJayHtml = assignCoordinatesToJayHtml(htmlWithRefs, contractNames);

        const finalDiscovery = discoverHeadlessInstances(preRenderedJayHtml);

        if (finalDiscovery.instances.length > 0) {
            // Slow-render ALL discovered instances (including unrolled slowForEach)
            const slowResult = await slowRenderInstances(
                finalDiscovery.instances,
                pageParts.headlessInstanceComponents,
            );

            if (slowResult) {
                // Merge instance phase data into carryForward
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
                (carryForward as any).__instanceSlowViewStates = {
                    ...((carryForward as any).__instanceSlowViewStates || {}),
                    ...Object.fromEntries(
                        slowResult.resolvedData.map((d) => [
                            d.coordinate.join('/'),
                            d.slowViewState,
                        ]),
                    ),
                };
                (carryForward as any).__instanceResolvedData = [
                    ...((carryForward as any).__instanceResolvedData || []),
                    ...slowResult.resolvedData,
                ];

                // Resolve instance bindings in jay-html
                const pass2Result = resolveHeadlessInstances(
                    preRenderedJayHtml,
                    slowResult.resolvedData,
                    JAY_IMPORT_RESOLVER,
                );
                if (pass2Result.val) {
                    preRenderedJayHtml = pass2Result.val;
                }
            }
        }
    }

    // Write clean pre-rendered file for compilation
    const preRenderedPath = path.join(instanceDir, `${instanceId}.jay-html`);
    await fs.writeFile(preRenderedPath, preRenderedJayHtml, 'utf-8');

    // Write cache metadata for the main server
    const cacheMetadataPath = path.join(instanceDir, `${instanceId}.cache.json`);
    await fs.writeFile(
        cacheMetadataPath,
        JSON.stringify({
            slowViewState,
            carryForward,
            sourcePath: route.jayHtmlPath,
        }),
        'utf-8',
    );

    logger.info(`[Build] Pre-rendered: ${routeDir}/${instanceId}`);

    // 3. Compile server element + extract CSS
    const serverElementPath = path.join(instanceDir, `${instanceId}.server-element.js`);
    const serverElementResult = await compileServerElement(
        preRenderedJayHtml,
        `${instanceId}.jay-html`,
        instanceDir,
        serverElementPath,
        ctx.projectRoot,
        ctx.tsConfigFilePath,
        sourceDir,
    );

    // 4. Generate hydration entry
    const hydrateEntryPath = path.join(instanceDir, `${instanceId}.hydrate-entry.ts`);
    const relativeJayHtmlPath = path.relative(instanceDir, preRenderedPath);

    // For NPM plugin routes, use /client entry + component export name
    let pageModulePath: string;
    let pageExportName: string;
    if (route.componentExport) {
        const pkgName = resolvePackageNameForRoute(route.compPath!);
        pageModulePath = pkgName
            ? `${pkgName}/client`
            : './' + path.relative(instanceDir, route.compPath!);
        pageExportName = route.componentExport;
    } else if (route.compPath) {
        pageModulePath = './' + path.relative(instanceDir, route.compPath);
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

    await generateHydrationEntry({
        jayHtmlPath: './' + relativeJayHtmlPath,
        pageModulePath,
        pageExportName,
        slowViewState,
        trackByMap: pageParts.clientTrackByMap || {},
        outputPath: hydrateEntryPath,
        keyedParts: pageParts.keyedPartModules,
        clientInits: ctx.clientInits,
    });

    // 5. Per-instance Vite build
    const clientResult = await buildInstanceClient(
        hydrateEntryPath,
        instanceId,
        instanceDir,
        ctx.projectRoot,
        ctx.jayOptions,
        ctx.minify ?? true,
        ctx.pagesRoot,
        ctx.buildDir,
    );

    await fs.rm(hydrateEntryPath, { force: true });

    const cssFile = clientResult.cssFile || serverElementResult.cssFile;
    const instanceEntry: InstanceEntry = {
        params,
        preRenderedPath: path.relative(ctx.buildDir, preRenderedPath),
        serverElementPath: path.relative(ctx.buildDir, serverElementPath),
        clientBundlePath: path.relative(ctx.buildDir, path.join(instanceDir, clientResult.jsFile)),
        clientCssPath: cssFile
            ? path.relative(ctx.buildDir, path.join(instanceDir, cssFile))
            : undefined,
    };

    return { status: 'success', instanceEntry, slowViewState, carryForward };
}
