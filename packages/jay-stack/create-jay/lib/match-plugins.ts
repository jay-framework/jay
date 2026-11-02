import { PLUGINS, PluginEntry } from './plugins.js';

export interface PluginSelection {
    selected: PluginEntry[];
    unknown: string[];
}

<<<<<<< HEAD
// Match case-insensitively on both the package name and the human label, so the documented
// Title-Case names (e.g. "Wix Members", "UI Kit") work, not only all-lowercase input.
function matchesRequest(plugin: PluginEntry, token: string): boolean {
    const normalized = token.toLowerCase();
    return plugin.name.toLowerCase() === normalized || plugin.label.toLowerCase() === normalized;
}

export function selectPluginsByRequest(requested: string[]): PluginSelection {
    const selected = PLUGINS.filter((plugin) =>
        requested.some((token) => matchesRequest(plugin, token)),
    );
    const unknown = requested.filter((token) => !PLUGINS.some((plugin) => matchesRequest(plugin, token)));
    return { selected, unknown };
=======
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
>>>>>>> origin/main
}
