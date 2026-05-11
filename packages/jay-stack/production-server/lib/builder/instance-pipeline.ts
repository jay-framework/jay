import {
    slowRenderTransform,
    parseContract,
    parseJayFile,
    JAY_IMPORT_RESOLVER,
    injectHeadfullFSTemplates,
    discoverHeadlessInstances,
    assignCoordinatesToJayHtml,
    resolveHeadlessInstances,
    type HeadlessContractInfo,
} from '@jay-framework/compiler-jay-html';
import { checkValidationErrors } from '@jay-framework/compiler-shared';
import {
    DevSlowlyChangingPhase,
    type DevServerPagePart,
    type HeadlessInstanceComponent,
    slowRenderInstances,
} from '@jay-framework/stack-server-runtime';
import type { JayRollupConfig } from '@jay-framework/compiler-jay-stack';
import type { JayRoute } from '@jay-framework/stack-route-scanner';
import type { AnyJayStackComponentDefinition } from '@jay-framework/fullstack-component';
import type { Contract } from '@jay-framework/compiler-jay-html';
import type { InstanceEntry } from '../types';
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

    const compDefinition: AnyJayStackComponentDefinition = pageModule.page ?? pageModule.default;
    const parts: DevServerPagePart[] = [
        {
            compDefinition,
            clientImport: '',
            clientPart: '',
        },
    ];

    // 1. Slow render
    const slowPhase = new DevSlowlyChangingPhase();
    const slowResult = await slowPhase.runSlowlyForPage(
        params,
        { params },
        parts,
        [],
        [],
        route.jayHtmlPath,
    );

    if (slowResult.kind !== 'PhaseOutput') {
        throw new Error(`Slow render failed for ${route.rawRoute} with params ${JSON.stringify(params)}: ${slowResult.kind}`);
    }

    const slowViewState = slowResult.rendered;
    const carryForward = slowResult.carryForward;

    // 2. Pre-render jay-html
    const jayHtmlContent = await fs.readFile(route.jayHtmlPath, 'utf-8');
    const sourceDir = path.dirname(route.jayHtmlPath);

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
        headlessContracts: [],
        sourceDir,
        importResolver: JAY_IMPORT_RESOLVER,
    });

    if (!transformResult.val) {
        throw new Error(`Slow render transform failed for ${route.rawRoute}: ${transformResult.validations.join(', ')}`);
    }

    const preRenderedJayHtml = transformResult.val.preRenderedJayHtml;

    // Embed cache metadata in pre-rendered file (same format as dev server)
    const metadata = JSON.stringify({ slowViewState, carryForward, sourcePath: route.jayHtmlPath });
    const cacheTag = `<script type="application/jay-cache">${metadata}</script>`;
    const preRenderedWithMeta = embedCacheTag(preRenderedJayHtml, cacheTag);

    const preRenderedPath = path.join(instanceDir, `${instanceId}.jay-html`);
    await fs.writeFile(preRenderedPath, preRenderedWithMeta, 'utf-8');

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
        jayHtmlPath: './' + relativeJayHtmlPath.replace(/\.jay-html$/, '.jay-html'),
        pageModulePath: './' + relativePageModule,
        slowViewState,
        trackByMap: {},
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

function embedCacheTag(jayHtmlContent: string, cacheTag: string): string {
    const headMatch = jayHtmlContent.match(/<head[^>]*>/i);
    if (headMatch) {
        const insertPos = headMatch.index! + headMatch[0].length;
        return (
            jayHtmlContent.substring(0, insertPos) +
            '\n' +
            cacheTag +
            jayHtmlContent.substring(insertPos)
        );
    }
    return `${cacheTag}\n${jayHtmlContent}`;
}
