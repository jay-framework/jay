import { PluginContext } from 'rollup';
import { getLogger } from '@jay-framework/logger';

export function watchChangesFor(context: PluginContext, sourcePath: string) {
    if (context.getWatchFiles().includes(sourcePath)) return;
    context.addWatchFile(sourcePath);
    getLogger().info(`[watch] add ${sourcePath}`);
}
