import { input, checkbox } from '@inquirer/prompts';
import { PLUGINS, type PluginEntry } from './plugins.js';

export function validateProjectName(value: string): boolean | string {
    const name = value.trim();
    if (!name) return 'Project name is required';
    if (name.length < 3) return 'Project name must be at least 3 characters';
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name)) {
        return 'Use lowercase letters, numbers, and hyphens — must start and end with a letter or number (e.g., my-store)';
    }
    return true;
}

export interface ProjectConfig {
    name: string;
    selectedPlugins: PluginEntry[];
}

export async function runPrompts(): Promise<ProjectConfig> {
    const name = await input({
        message: 'Project name:',
        validate: validateProjectName,
    });

    const groups = new Map<string, PluginEntry[]>();
    for (const plugin of PLUGINS) {
        const group = groups.get(plugin.group) || [];
        group.push(plugin);
        groups.set(plugin.group, group);
    }

    const choices = [];
    for (const [group, plugins] of groups) {
        choices.push({ name: `── ${group} ──`, value: '__separator__', disabled: ' ' });
        for (const plugin of plugins) {
            choices.push({
                name: `${plugin.label} — ${plugin.description}`,
                value: plugin.name,
                checked: plugin.checked,
            });
        }
    }

    const selected = await checkbox({
        message: 'Select plugins to install:',
        choices,
        pageSize: process.stdout.rows ? process.stdout.rows - 5 : 20,
    });

    const selectedPlugins = PLUGINS.filter((p) => selected.includes(p.name));

    return { name: name.trim(), selectedPlugins };
}
