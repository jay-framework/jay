import { PluginContext, TransformResult } from 'rollup';
import { getJayFileStructure } from './get-jay-file-structure';
import { JayPluginContext } from './jay-plugin-context';
import { generateCodeFromStructure } from './generate-code-from-structure';
import { getModeFromExtension } from 'jay-compiler-shared';
import { getJayMetadata } from './metadata';

export async function transformJayFile(
    jayContext: JayPluginContext,
    context: PluginContext,
    code: string,
    id: string,
): Promise<TransformResult> {
    if (!Boolean(getJayMetadata(context, id).originId)) return null;

    const mode = getModeFromExtension(id);
    console.info(`[transform] start ${mode} ${id}`);
    const { meta, jayFile } = await getJayFileStructure(jayContext, context, code, id);
    const tsCode = await generateCodeFromStructure(jayContext, context, code, id, meta, jayFile);
    console.info(`[transform] end ${mode} ${id}`);
    return { code: tsCode };
}
