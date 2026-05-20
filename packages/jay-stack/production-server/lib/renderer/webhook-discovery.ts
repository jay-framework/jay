import { isJayWebhook, type JayWebhook } from '@jay-framework/fullstack-component';
import { scanPlugins } from '@jay-framework/stack-server-runtime';
import { getLogger } from '@jay-framework/logger';
import path from 'node:path';
import fs from 'node:fs/promises';

export interface DiscoveredWebhook {
    name: string;
    webhook: JayWebhook;
    source: string;
}

export async function discoverWebhooks(
    projectRoot: string,
    serverBuildDir: string,
): Promise<DiscoveredWebhook[]> {
    const logger = getLogger();
    const webhooks: DiscoveredWebhook[] = [];

    // Scan NPM plugins — read webhook names from plugin.yaml, load from module
    try {
        const plugins = await scanPlugins({ projectRoot });
        for (const [packageName, plugin] of plugins) {
            if (plugin.isLocal) continue;
            const declaredWebhooks = plugin.manifest.webhooks;
            if (!declaredWebhooks || declaredWebhooks.length === 0) continue;

            try {
                const pluginModule = await import(packageName);
                for (const entry of declaredWebhooks) {
                    const exportName = typeof entry === 'string' ? entry : entry.name;
                    const value = pluginModule[exportName];
                    if (isJayWebhook(value)) {
                        webhooks.push({
                            name: value.webhookName,
                            webhook: value,
                            source: packageName,
                        });
                        logger.info(
                            `[Renderer] Webhook "${value.webhookName}" from ${plugin.manifest.name}`,
                        );
                    } else {
                        logger.warn(
                            `[Renderer] plugin.yaml declares webhook "${exportName}" but export is not a JayWebhook in ${packageName}`,
                        );
                    }
                }
            } catch (err: any) {
                logger.warn(
                    `[Renderer] Failed to load webhooks from ${packageName}: ${err.message}`,
                );
            }
        }
    } catch {
        // No plugins
    }

    // Scan local plugins (src/plugins/) — same pattern
    try {
        const plugins = await scanPlugins({ projectRoot });
        for (const [, plugin] of plugins) {
            if (!plugin.isLocal) continue;
            const declaredWebhooks = plugin.manifest.webhooks;
            if (!declaredWebhooks || declaredWebhooks.length === 0) continue;

            const pluginDirName = path.basename(plugin.pluginPath);
            for (const entry of declaredWebhooks) {
                const exportName = typeof entry === 'string' ? entry : entry.name;
                const modulePath = path.join(serverBuildDir, 'plugins', pluginDirName, 'index.js');
                try {
                    const mod = await import(modulePath);
                    const value = mod[exportName];
                    if (isJayWebhook(value)) {
                        webhooks.push({
                            name: value.webhookName,
                            webhook: value,
                            source: `local:${plugin.manifest.name}`,
                        });
                        logger.info(
                            `[Renderer] Webhook "${value.webhookName}" from local plugin ${plugin.manifest.name}`,
                        );
                    }
                } catch (err: any) {
                    logger.warn(
                        `[Renderer] Failed to load webhook "${exportName}" from local plugin ${plugin.manifest.name}: ${err.message}`,
                    );
                }
            }
        }
    } catch {
        // No local plugins
    }

    // Scan project webhook files (src/webhooks/*.ts compiled to server/webhooks/*.js)
    const webhooksDir = path.join(serverBuildDir, 'webhooks');
    try {
        const files = await fs.readdir(webhooksDir);
        for (const file of files) {
            if (!file.endsWith('.js')) continue;
            try {
                const mod = await import(path.join(webhooksDir, file));
                for (const [, value] of Object.entries(mod)) {
                    if (isJayWebhook(value)) {
                        webhooks.push({
                            name: value.webhookName,
                            webhook: value,
                            source: `project:${file}`,
                        });
                        logger.info(`[Renderer] Webhook "${value.webhookName}" from project`);
                    }
                }
            } catch (err: any) {
                logger.warn(`[Renderer] Failed to load webhook ${file}: ${err.message}`);
            }
        }
    } catch {
        // No webhooks directory
    }

    return webhooks;
}
