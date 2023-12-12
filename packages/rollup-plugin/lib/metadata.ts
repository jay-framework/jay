import { PluginContext } from 'rollup';

export enum JayFormat {
    Html = 'html',
    Typescript = 'typescript',
}

export interface JayMetadata {
    originalId?: string;
    format?: JayFormat;
}

export function appendJayMetadata(
    context: PluginContext,
    id: string,
    metadata: JayMetadata,
): { jay: JayMetadata } {
    const jayMeta = context.getModuleInfo(id)?.meta?.jay ?? {};
    return { jay: { ...jayMeta, ...metadata } };
}
