import { PLUGINS, PluginEntry } from './plugins.js';

export interface PluginSelection {
    selected: PluginEntry[];
    unknown: string[];
}

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
}
