import { getLogger } from '@jay-framework/logger';

export interface PluginWithDependencies {
    name: string;
    packageName: string;
    dependencies: string[];
}

/**
 * Sorts plugins by package.json dependencies (topological sort).
 * Plugins with no in-graph dependencies come first; dependents follow.
 */
export function sortPluginsByDependencies<T extends PluginWithDependencies>(plugins: T[]): T[] {
    const pluginNames = new Set(plugins.map((plugin) => plugin.packageName));
    const sorted: T[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    function visit(plugin: T) {
        if (visited.has(plugin.packageName)) return;
        if (visiting.has(plugin.packageName)) {
            getLogger().warn(`[PluginSort] Circular dependency detected for ${plugin.name}`);
            return;
        }

        visiting.add(plugin.packageName);

        for (const dependency of plugin.dependencies) {
            if (pluginNames.has(dependency)) {
                const dependencyPlugin = plugins.find(
                    (candidate) => candidate.packageName === dependency,
                );
                if (dependencyPlugin) {
                    visit(dependencyPlugin);
                }
            }
        }

        visiting.delete(plugin.packageName);
        visited.add(plugin.packageName);
        sorted.push(plugin);
    }

    for (const plugin of plugins) {
        visit(plugin);
    }

    return sorted;
}
