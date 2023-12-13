import { PluginContext } from 'rollup';

export function watchChangesFor(context: PluginContext, sourcePath: string) {
    context.addWatchFile(sourcePath);
    context.debug(`[resolveId:watch] ${sourcePath}`);
}
