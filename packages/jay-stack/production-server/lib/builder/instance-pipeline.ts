import {
    slowRenderTransform,
    parseContract,
    JAY_IMPORT_RESOLVER,
    injectHeadfullFSTemplates,
    discoverHeadlessInstances,
    assignCoordinatesToJayHtml,
    resolveHeadlessInstances,
} from '@jay-framework/compiler-jay-html';
import {
    DevSlowlyChangingPhase,
    slowRenderInstances,
} from '@jay-framework/stack-server-runtime';
import type { JayRollupConfig } from '@jay-framework/compiler-jay-stack';
import type { JayRoute } from '@jay-framework/stack-route-scanner';
import type { Contract } from '@jay-framework/compiler-jay-html';
import type { InstanceEntry } from '../types';
import type { InstancePhaseData } from '@jay-framework/stack-server-runtime';
import { loadProductionPageParts } from './load-production-parts';
import { compileServerElement } from './server-element-compile';
import { generateHydrationEntry } from './hydration-entry-gen';
import { buildInstanceClient } from './instance-client-build';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export interface InstanceBuildContext {
    projectRoot: string;
    buildDir: string;
    jayOptions: JayRollupConfig;
    tsConfigFilePath?: string;
}

export interface InstanceBuildResult {
    instanceEntry: InstanceEntry;
    slowViewState: object;
    carryForward: object;
}

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
    const instanceDir = path.join(ctx.buildDir, 'instances', routeDir);

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
        throw new Error(`Slow render failed for ${route.rawRoute} with params ${JSON.stringify(params)}: ${slowResult.kind}`);
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

    const jayHtmlWithTemplates = injectHeadfullFSTemplates(jayHtmlContent, sourceDir, JAY_IMPORT_RESOLVER);

    const transformResult = slowRenderTransform({
        jayHtmlContent: jayHtmlWithTemplates,
        slowViewState: slowViewState as Record<string, unknown>,
        contract,
        headlessContracts: pageParts.headlessContracts,
        sourceDir,
        importResolver: JAY_IMPORT_RESOLVER,
    });

    if (!transformResult.val) {
        throw new Error(`Slow render transform failed for ${route.rawRoute}: ${transformResult.validations.join(', ')}`);
    }

    let preRenderedJayHtml = transformResult.val.preRenderedJayHtml;

    // Pass 2: Headless instance bindings (same as dev server's preRenderJayHtml)
    if (pageParts.headlessInstanceComponents.length > 0) {
        const discoveryResult = discoverHeadlessInstances(preRenderedJayHtml);
        const htmlWithRefs = discoveryResult.preRenderedJayHtml;
        const contractNames = new Set(pageParts.headlessInstanceComponents.map((c) => c.contractName));
        preRenderedJayHtml = assignCoordinatesToJayHtml(htmlWithRefs, contractNames);

        const finalDiscovery = discoverHeadlessInstances(preRenderedJayHtml);

        if (finalDiscovery.instances.length > 0) {
            const instanceResolvedData = (carryForward as any).__instanceResolvedData;
            if (instanceResolvedData) {
                const pass2Result = resolveHeadlessInstances(
                    preRenderedJayHtml,
                    instanceResolvedData,
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
    await fs.writeFile(cacheMetadataPath, JSON.stringify({
        slowViewState,
        carryForward,
        sourcePath: route.jayHtmlPath,
    }), 'utf-8');

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
    const relativePageModule = path.relative(
        instanceDir,
        route.compPath || route.jayHtmlPath.replace('.jay-html', '.ts'),
    );

    await generateHydrationEntry({
        jayHtmlPath: './' + relativeJayHtmlPath,
        pageModulePath: './' + relativePageModule,
        slowViewState,
        trackByMap: pageParts.clientTrackByMap || {},
        outputPath: hydrateEntryPath,
    });

    // 5. Per-instance Vite build
    const clientResult = await buildInstanceClient(
        hydrateEntryPath,
        instanceId,
        instanceDir,
        ctx.projectRoot,
        ctx.jayOptions,
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

    return { instanceEntry, slowViewState, carryForward };
}
