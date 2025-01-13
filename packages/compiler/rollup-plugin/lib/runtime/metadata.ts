import { CustomPluginOptions, PluginContext } from 'rollup';
import { SourceFileFormat } from 'jay-compiler-shared';

export interface JayMetadata {
    originId?: string;
    format?: SourceFileFormat;
    isWorkerRoot?: boolean;
}

export function getJayMetadata(
    context: PluginContext,
    id: string,
    { checkPresent = false }: { checkPresent?: boolean } = {},
): JayMetadata {
    return jayMetadataFromModuleMetadata(id, context.getModuleInfo(id)?.meta, { checkPresent });
}

export function jayMetadataFromModuleMetadata(
    id: string,
    meta: CustomPluginOptions | undefined,
    { checkPresent = false }: { checkPresent?: boolean } = {},
): JayMetadata {
    const metadata = meta?.jay ?? {};
    if (checkPresent) {
        if (!metadata.originId) throw new Error(`Unknown Jay originId for ${id}`);
        if (!metadata.format) throw new Error(`Unknown Jay format for ${id}`);
    }
    return metadata;
}

export function appendJayMetadata(
    context: PluginContext,
    id: string,
    metadata: JayMetadata,
    moduleMetadata?: CustomPluginOptions,
): { jay: JayMetadata } {
    return { jay: { ...(moduleMetadata ?? getJayMetadata(context, id)), ...metadata } };
}

export function getSourceJayMetadata(context: PluginContext, id: string): JayMetadata {
    const metadata = getJayMetadata(context, id, { checkPresent: true });
    const sourcePath = metadata.originId;
    if (!sourcePath) throw new Error(`Unknown Jay originId for ${id}`);
    const sourceMetadata = getJayMetadata(context, sourcePath);
    return sourceMetadata.originId ? sourceMetadata : metadata;
}

export function isWorkerRoot(context: PluginContext, id: string): boolean {
    return getJayMetadata(context, id).isWorkerRoot ?? false;
}
