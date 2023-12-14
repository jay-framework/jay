import { PluginContext } from 'rollup';

export enum JayFormat {
    Html = 'html',
    Typescript = 'typescript',
}

export interface JayMetadata {
    originalId?: string;
    format?: JayFormat;
    isWorkerRoot?: boolean;
}

export function appendJayMetadata(
    context: PluginContext,
    id: string,
    metadata: JayMetadata,
): { jay: JayMetadata } {
    return { jay: { ...getJayMetadata(context, id), ...metadata } };
}

export function getJayMetadata(context: PluginContext, id: string): JayMetadata {
    return context.getModuleInfo(id)?.meta?.jay ?? {};
}

export function isWorkerRoot(context: PluginContext, id: string): boolean {
    return getJayMetadata(context, id).isWorkerRoot ?? false;
}
