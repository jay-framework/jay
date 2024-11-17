import { PluginContext } from 'rollup';

export function watchChangesFor(context: PluginContext, sourcePath: string) {
    if (context.getWatchFiles().includes(sourcePath)) return;
    context.addWatchFile(sourcePath);
    console.info(`[watch] add ${sourcePath}`);
}
