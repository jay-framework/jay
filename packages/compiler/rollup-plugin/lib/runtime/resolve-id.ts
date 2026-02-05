import { CustomPluginOptions, PluginContext, ResolvedId, ResolveIdResult } from 'rollup';
import { watchChangesFor } from './watch';
import { SANDBOX_ROOT_PREFIX } from './sandbox';
import { appendJayMetadata, getJayMetadata, jayMetadataFromModuleMetadata } from './metadata';
import {
    CSS_EXTENSION,
    GenerateTarget,
    hasExtension,
    JAY_EXTENSION,
    JAY_QUERY_MAIN_SANDBOX,
    JAY_QUERY_WORKER_TRUSTED_TS,
    parseJayModuleSpecifier,
    SourceFileFormat,
    TS_EXTENSION,
    TSX_EXTENSION,
} from '@jay-framework/compiler-shared';
import { getLogger } from '@jay-framework/logger';
import { stripTSExtension } from './load';

const JAY_HTML_CSS = '.css';

export interface ResolveIdOptions {
    attributes: Record<string, string>;
    custom?: CustomPluginOptions;
    isEntry: boolean;
    skipSelf?: boolean;
}

export async function resolveJayHtml(
    context: PluginContext,
    source: string,
    importer: string | undefined,
    options: ResolveIdOptions,
    root: string,
    generationTarget: GenerateTarget = GenerateTarget.jay,
): Promise<ResolveIdResult> {
    // Parse source to handle query parameters - resolve only the base path
    const sourceParsed = parseJayModuleSpecifier(source);
    const sourceBasePath = sourceParsed.basePath;

    // Skip if source already ends with .ts/.tsx (already resolved)
    // But we need to still return id with metadata to avoid load errors
    if (source.endsWith(TS_EXTENSION) || source.endsWith(TSX_EXTENSION)) {
        // Already resolved - return as-is with metadata so load hook works
        const originId = sourceBasePath.replace(TS_EXTENSION, '').replace(TSX_EXTENSION, '');
        getLogger().info(`[resolveId] already resolved ${source}, originId: ${originId}`);
        return {
            id: source,
            meta: appendJayMetadata(context, source, {
                format: SourceFileFormat.JayHtml,
                originId,
            }),
        };
    }

    const resolved = await context.resolve(sourceBasePath, importer, {
        ...options,
        skipSelf: true,
    });
    if (
        !resolved ||
        hasExtension(resolved.id, TS_EXTENSION) ||
        hasExtension(resolved.id, TSX_EXTENSION)
    )
        return null;

    // Parse the resolved id as well (it shouldn't have query params, but be safe)
    const resolvedParsed = parseJayModuleSpecifier(resolved.id);
    const resolvedBasePath = resolvedParsed.basePath;

    const resolvedJayMeta = jayMetadataFromModuleMetadata(resolved.id, resolved.meta);
    const extension = generationTarget === GenerateTarget.react ? TSX_EXTENSION : TS_EXTENSION;

    let format: SourceFileFormat, originId: string;
    if (resolvedJayMeta.originId) {
        format = resolvedJayMeta.format;
        originId = resolvedJayMeta.originId;
    } else {
        watchChangesFor(context, resolvedBasePath);
        format = SourceFileFormat.JayHtml;
        originId = resolvedBasePath;
    }

    // Build the id: originId + query params (if any) + extension
    // This maintains backwards compatibility with hasJayModeExtension which expects .ts at the end
    const baseWithQuery = sourceParsed.fullQueryString
        ? `${originId}${sourceParsed.fullQueryString}`
        : originId;

    const id =
        context['ssr'] && originId.startsWith(root)
            ? `${baseWithQuery}${extension}`.slice(root.length)
            : `${baseWithQuery}${extension}`;

    getLogger().info(`[resolveId] resolved ${id} as ${format}`);
    return { id, meta: appendJayMetadata(context, id, { format, originId }) };
}

export async function resolveJayContract(
    context: PluginContext,
    source: string,
    importer: string | undefined,
    options: ResolveIdOptions,
    root: string,
) {
    // Parse source to handle query parameters - resolve only the base path
    const sourceParsed = parseJayModuleSpecifier(source);
    const sourceBasePath = sourceParsed.basePath;

    // Skip if source already ends with .ts/.tsx (already resolved)
    // But we need to still return id with metadata to avoid load errors
    if (source.endsWith(TS_EXTENSION) || source.endsWith(TSX_EXTENSION)) {
        // Already resolved - return as-is with metadata so load hook works
        const originId = sourceBasePath.replace(TS_EXTENSION, '').replace(TSX_EXTENSION, '');
        getLogger().info(`[resolveId] already resolved contract ${source}, originId: ${originId}`);
        return {
            id: source,
            meta: appendJayMetadata(context, source, {
                format: SourceFileFormat.JayContract,
                originId,
            }),
        };
    }

    const resolved = await context.resolve(sourceBasePath, importer, {
        ...options,
        skipSelf: true,
    });
    if (!resolved) return null;

    // Parse the resolved id as well (it shouldn't have query params, but be safe)
    const resolvedParsed = parseJayModuleSpecifier(resolved.id);
    const originId = resolvedParsed.basePath;

    // Build the id: basePath + query params (if any) + .ts
    // This maintains backwards compatibility - .ts at the end
    const baseWithQuery = sourceParsed.fullQueryString
        ? `${originId}${sourceParsed.fullQueryString}`
        : originId;

    // Handle SSR mode path transformation (same as resolveJayHtml)
    const id =
        context['ssr'] && originId.startsWith(root)
            ? `${baseWithQuery}${TS_EXTENSION}`.slice(root.length)
            : `${baseWithQuery}${TS_EXTENSION}`;

    getLogger().info(
        `[resolveId] contract  - id: ${id}, originId: ${originId}, ssr: ${context['ssr']}`,
    );
    return {
        id,
        meta: appendJayMetadata(context, id, {
            format: SourceFileFormat.JayContract,
            originId, // Use basePath without query params for file loading
        }),
    };
}

export async function resolveJayModeFile(
    context: PluginContext,
    source: string,
    importer: string | undefined,
    options: ResolveIdOptions,
): Promise<ResolveIdResult> {
    const idParts = source.split('?');
    const idWithoutJayModeExtension = idParts.slice(0, -1).join('?');
    const mode = idParts.slice(-1)[0];
    const resolved = await context.resolve(idWithoutJayModeExtension, importer, {
        ...options,
        skipSelf: false,
    });
    if (!resolved) return null;

    const resolvedJayMeta = jayMetadataFromModuleMetadata(resolved.id, resolved.meta);
    const format = resolvedJayMeta.format || SourceFileFormat.TypeScript;
    const originId = resolvedJayMeta.originId || resolved.id;
    const id = getResolvedId(resolved, mode, originId);
    getLogger().info(`[resolveId] resolved ${id} as ${format}`);
    return { id, meta: appendJayMetadata(context, id, { format, originId }, resolvedJayMeta) };
}

export async function removeSandboxPrefixForWorkerRoot(
    context: PluginContext,
    source: string,
    importer: string,
    options: ResolveIdOptions,
): Promise<ResolveIdResult> {
    const sourceWithoutPrefix = source.replace(SANDBOX_ROOT_PREFIX, '');
    const resolved = await context.resolve(sourceWithoutPrefix, importer, {
        ...options,
        skipSelf: true,
    });
    if (!resolved) return null;

    const id = `${resolved.id}${JAY_QUERY_WORKER_TRUSTED_TS}`;
    const originId = id.split('?')[0];
    getLogger().info(`[resolveId] resolved sandbox root ${id}`);
    return {
        id,
        meta: appendJayMetadata(context, id, {
            originId,
            format: SourceFileFormat.TypeScript,
            isWorkerRoot: true,
        }),
    };
}

function getResolvedId(resolved: ResolvedId, mode: string, originId: string): string {
    const extension = resolved.id.split('.').pop();
    return `${originId}?${mode}.${extension}`;
}

export function hasCssImportedByJayHtml(source: string, importer: string | undefined) {
    return (
        hasExtension(source, CSS_EXTENSION) &&
        importer &&
        (hasExtension(importer, JAY_EXTENSION, { withTs: true }) ||
            hasExtension(importer, JAY_EXTENSION + JAY_QUERY_MAIN_SANDBOX, { withTs: true }))
    );
}

export function resolveCssFileImportedByJayHtml(
    context: PluginContext,
    importer: string,
    root: string,
) {
    const originImporter = importer.split('?')[0];
    const originId = context['ssr']
        ? getJayMetadata(context, originImporter)?.originId
        : stripTSExtension(originImporter);

    const id =
        context['ssr'] && originId.startsWith(root)
            ? `${originId}${JAY_HTML_CSS}`.slice(root.length)
            : `${originId}${JAY_HTML_CSS}`;
    return {
        id,
        meta: appendJayMetadata(context, id, {
            format: SourceFileFormat.CSS,
            originId: originId,
        }),
    };
}

export function isResolvedCssFile(id: string) {
    return id.endsWith(JAY_HTML_CSS) && id.indexOf(JAY_EXTENSION) > 0;
}
