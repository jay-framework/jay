import { PLUGINS, PluginEntry } from './plugins.js';

export interface PluginSelection {
    selected: PluginEntry[];
    unknown: string[];
}

const PACKAGE_SCOPE = '@jay-framework/';

const normalize = (token: string): string => token.trim().toLowerCase();

// Accepts the package name, its unscoped form, or the human label
// (e.g. "@jay-framework/wix-members", "wix-members", "Wix Members").
const PLUGIN_BY_TOKEN = new Map<string, PluginEntry>(
    PLUGINS.flatMap((plugin) =>
        [plugin.name, plugin.name.replace(PACKAGE_SCOPE, ''), plugin.label].map(
            (alias) => [normalize(alias), plugin] as const,
        ),
    ),
);

export function selectPluginsByRequest(requested: string[]): PluginSelection {
    const matched = new Set<PluginEntry>();
    const unknown: string[] = [];

    for (const token of requested) {
        const plugin = PLUGIN_BY_TOKEN.get(normalize(token));
        if (plugin) matched.add(plugin);
        else unknown.push(token);
    }

    return { selected: PLUGINS.filter((plugin) => matched.has(plugin)), unknown };
}
