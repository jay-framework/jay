/**
 * SSR-render a headfull component as a full HTML document for iframe preview.
 * Used by dev-only headfull preview HTTP routes (AIditor component views).
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import type { ViteDevServer } from 'vite';
import type { JayRollupConfig } from '@jay-framework/rollup-plugin';
import { generateFrozenPageHtml } from '@jay-framework/stack-server-build';
import {
    injectHeadfullFSTemplates,
    JAY_IMPORT_RESOLVER,
} from '@jay-framework/compiler-jay-html';
import { getLogger } from '@jay-framework/logger';

export type HeadfullPagePreviewInput = {
    tsPath: string;
    jayHtmlPath: string;
    exportName: string;
    props: Record<string, unknown>;
    injectDevHmr?: boolean;
    requestUrl?: string;
    cacheKey?: string;
};

export type HeadfullPagePreviewResult =
    | { ok: true; html: string }
    | { ok: false; error: string };

export function headfullPreviewOutputRouteDir(
    componentId: string,
    propsHash?: string,
): string {
    const safe = componentId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return propsHash ? `headfull/${safe}/${propsHash}` : `headfull/${safe}`;
}

function propsFingerprint(props: Record<string, unknown>): string {
    return createHash('sha256')
        .update(JSON.stringify(props))
        .digest('hex')
        .slice(0, 12);
}

export async function renderHeadfullPagePreview(
    vite: ViteDevServer,
    input: HeadfullPagePreviewInput,
    projectBase: string,
    buildFolder: string,
    jayRollupConfig: JayRollupConfig,
): Promise<HeadfullPagePreviewResult> {
    try {
        const componentModule = await vite.ssrLoadModule(input.tsPath);
        const componentExport = componentModule[input.exportName] as {
            slowlyRender?: (
                props: Record<string, unknown>,
                ...services: unknown[]
            ) => Promise<{ kind: string; rendered?: Record<string, unknown> }>;
        };
        if (!componentExport?.slowlyRender) {
            return {
                ok: false,
                error: `Export "${input.exportName}" has no slowlyRender phase`,
            };
        }

        const slowResult = await componentExport.slowlyRender(input.props);
        if (slowResult.kind !== 'PhaseOutput' || !slowResult.rendered) {
            return {
                ok: false,
                error: `slowlyRender did not return PhaseOutput for "${input.exportName}"`,
            };
        }

        const jayHtmlDir = path.dirname(input.jayHtmlPath);
        const jayHtmlFilename = path.basename(input.jayHtmlPath);
        const jayHtmlContent = await fs.readFile(input.jayHtmlPath, 'utf-8');
        const injectedJayHtml = injectHeadfullFSTemplates(
            jayHtmlContent,
            jayHtmlDir,
            JAY_IMPORT_RESOLVER,
        );

        const srcRoot = path.join(projectBase, 'src');
        const routeDir = path.relative(srcRoot, jayHtmlDir);
        const propsHash = propsFingerprint(input.props);
        const cacheKey =
            input.cacheKey ?? `${input.tsPath}:${propsHash}`;
        const outputRouteDir = headfullPreviewOutputRouteDir(
            cacheKey.replace(/[^a-zA-Z0-9_:/-]/g, '_'),
            propsHash,
        );

        let html = await generateFrozenPageHtml(
            vite,
            injectedJayHtml,
            jayHtmlFilename,
            jayHtmlDir,
            slowResult.rendered,
            buildFolder,
            projectBase,
            routeDir,
            jayRollupConfig?.tsConfigFilePath,
            srcRoot,
            'page',
            undefined,
            {
                injectDevHmr: input.injectDevHmr === true,
                moduleCacheKey: cacheKey,
                outputRouteDir,
                compactPreview: true,
            },
        );

        if (input.injectDevHmr) {
            html = await vite.transformIndexHtml('/aiditor/headfull-preview', html);
        }

        return { ok: true, html };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        getLogger().warn(`[HeadfullPreview] ${message}`);
        return { ok: false, error: message };
    }
}
