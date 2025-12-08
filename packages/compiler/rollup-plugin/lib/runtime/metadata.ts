import { CustomPluginOptions, PluginContext } from 'rollup';
import { SourceFileFormat } from '@jay-framework/compiler-shared';

export interface JayMetadata {
    originId?: string;
    format?: SourceFileFormat;
    isWorkerRoot?: boolean;
}

const SSR_METADATA = new Map<string, JayMetadata>();

export function getJayMetadata(
    context: PluginContext,
    id: string,
    { checkPresent = false }: { checkPresent?: boolean } = {},
): JayMetadata {
    // vite does not store module metadata in SSR
    const metadataFromPlugin: JayMetadata = context.getModuleInfo(id)?.meta?.jay;
    const metadata = context['ssr']
        ? metadataFromPlugin || SSR_METADATA.get(id) || {}
        : metadataFromPlugin || {};
    validateJayMetadata(id, metadata, checkPresent);
    return metadata;
}

export function jayMetadataFromModuleMetadata(
    id: string,
    meta: CustomPluginOptions | undefined,
    { checkPresent = false }: { checkPresent?: boolean } = {},
): JayMetadata {
    const metadata = meta?.jay ?? {};
    validateJayMetadata(id, metadata, checkPresent);
    return metadata;
}

function validateJayMetadata(id: string, jayMetadata: JayMetadata, doValidate: boolean) {
    if (doValidate) {
        if (!jayMetadata.originId) throw new Error(`Unknown Jay originId for ${id}`);
        if (!jayMetadata.format) throw new Error(`Unknown Jay format for ${id}`);
    }
}

export function appendJayMetadata(
    context: PluginContext,
    id: string,
    metadata: JayMetadata,
    moduleMetadata?: CustomPluginOptions,
): { jay: JayMetadata } {
    // vite does not store module metadata in SSR
    if (context['ssr']) {
        SSR_METADATA.set(id, metadata);
    }
    return { jay: { ...(moduleMetadata ?? getJayMetadata(context, id)), ...metadata } };
}

export function getSourceJayMetadata(context: PluginContext, id: string): JayMetadata {
    const metadata = getJayMetadata(context, id, { checkPresent: true });
    const sourcePath = metadata.originId;
    if (!sourcePath) throw new Error(`Unknown Jay originId for ${id}`);
    const sourceMetadata = getJayMetadata(context, sourcePath);
    return sourceMetadata?.originId ? sourceMetadata : metadata;
}

export function isWorkerRoot(context: PluginContext, id: string): boolean {
    return getJayMetadata(context, id).isWorkerRoot ?? false;
}
