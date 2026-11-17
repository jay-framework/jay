import type { PluginEntry } from './plugins.js';

export type PackageManager = 'yarn' | 'npm';

const UI_KIT_PLUGIN = '@jay-framework/ui-kit';

/**
 * Render the starter home page. The letter-split hero uses the UI Kit plugin, so it is only emitted
 * when UI Kit is selected — otherwise a fresh project would import a plugin that is not installed and
 * fail `jay-stack validate` (DL#235).
 */
export function renderHomePage(
    template: string,
    projectName: string,
    selectedPlugins: PluginEntry[],
): string {
    const uiKit = selectedPlugins.some((plugin) => plugin.name === UI_KIT_PLUGIN);
    return renderSections(template, { uiKit }).replace(/\{\{name\}\}/g, projectName);
}

/** Render agent guidance (CLAUDE.md / agents.md) with the run command of the package manager used. */
export function renderAgentGuidance(template: string, packageManager: PackageManager): string {
    const runCommand = packageManager === 'yarn' ? 'yarn' : 'npm run';
    return template.replace(/\{\{run\}\}/g, runCommand);
}

/**
 * `{{#flag}}…{{/flag}}` keeps its body when the flag is true; `{{^flag}}…{{/flag}}` when false.
 * A section's marker lines are removed entirely, so the output carries no blank leftovers.
 */
export function renderSections(template: string, flags: Record<string, boolean>): string {
    return template.replace(
        /^\{\{([#^])(\w+)\}\}\n([\s\S]*?)^\{\{\/\2\}\}\n/gm,
        (_section, kind: string, flag: string, body: string) => {
            if (!(flag in flags)) throw new Error(`Unknown template section flag "${flag}"`);
            const keep = kind === '#' ? flags[flag] : !flags[flag];
            return keep ? body : '';
        },
    );
}
