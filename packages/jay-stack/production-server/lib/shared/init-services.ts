import { getLogger } from '@jay-framework/logger';
import { setClientInitData } from '@jay-framework/stack-server-runtime';
import path from 'node:path';

export async function initializeServices(
    buildDir: string,
    projectRoot: string,
    label: string,
): Promise<void> {
    const logger = getLogger();
    const { discoverPluginsWithInit, sortPluginsByDependencies } = await import(
        '@jay-framework/stack-server-runtime'
    );

    try {
        const pluginsWithInit = sortPluginsByDependencies(
            await discoverPluginsWithInit({ projectRoot }),
        );
        for (const pluginInit of pluginsWithInit) {
            try {
                let modulePath: string;
                if (pluginInit.isLocal) {
                    const pluginDirName = path.basename(pluginInit.pluginPath);
                    const initModule = pluginInit.initModule || 'index';
                    modulePath = path.join(
                        buildDir,
                        'server',
                        'plugins',
                        pluginDirName,
                        initModule + '.js',
                    );
                } else {
                    modulePath = pluginInit.packageName;
                }
                const pluginModule = await import(modulePath);
                const init = pluginModule.init || pluginModule[pluginInit.initExport || 'init'];
                if (init?._serverInit) {
                    logger.info(`[${label}] Running plugin init: ${pluginInit.name}`);
                    const data = await init._serverInit();
                    if (data) setClientInitData(pluginInit.name, data);
                }
            } catch (err: any) {
                logger.warn(`[${label}] Plugin init failed: ${pluginInit.name}: ${err.message}`);
            }
        }
    } catch {
        // No plugins with init
    }

    const initModulePath = path.join(buildDir, 'server', 'init.js');
    try {
        const initModule = await import(initModulePath);
        const init = initModule.init || initModule.default;
        if (init?._serverInit) {
            logger.info(`[${label}] Running server init...`);
            const data = await init._serverInit();
            if (data) setClientInitData('project', data);
        }
    } catch {
        // No init module
    }
}
