import { input, checkbox } from '@inquirer/prompts';
import { PLUGINS, type PluginEntry } from './plugins.js';

export interface ProjectConfig {
    name: string;
    selectedPlugins: PluginEntry[];
}

export async function runPrompts(): Promise<ProjectConfig> {
    const name = await input({
        message: 'Project name:',
        validate: (value) => {
            if (!value.trim()) return 'Project name is required';
            if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value.trim())) {
                return 'Use lowercase letters, numbers, and hyphens (e.g., my-store)';
            }
            return true;
        },
    });

    const groups = new Map<string, PluginEntry[]>();
    for (const plugin of PLUGINS) {
        const group = groups.get(plugin.group) || [];
        group.push(plugin);
        groups.set(plugin.group, group);
    }

    const choices = [];
    for (const [group, plugins] of groups) {
        choices.push({ name: `── ${group} ──`, value: '__separator__', disabled: '' });
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
    });

    const selectedPlugins = PLUGINS.filter((p) => selected.includes(p.name));

    return { name: name.trim(), selectedPlugins };
}
