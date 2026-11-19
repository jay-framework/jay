import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import type { PluginSummary } from './types';
import type { SetupRun } from './plugin-handlers';
import { isScriptFile } from './denylist';
import { pluginFolderPath } from './manifest';

interface PluginYaml {
    name?: string;
    contracts?: { name: string }[];
    actions?: (string | { name: string })[];
    routes?: { path: string }[];
}

export function readPluginYaml(pluginDir: string): PluginYaml | undefined {
    const file = path.join(pluginDir, 'plugin.yaml');
    if (!fs.existsSync(file)) return undefined;
    return (YAML.parse(fs.readFileSync(file, 'utf-8')) ?? {}) as PluginYaml;
}

export function summarizePlugin(input: {
    projectRoot: string;
    folder: string;
    repo: string;
    sha: string;
    setupRun: SetupRun;
}): PluginSummary {
    const { projectRoot, folder, repo, sha, setupRun } = input;
    const pluginDir = pluginFolderPath(projectRoot, folder);
    const manifest = readPluginYaml(pluginDir) ?? {};
    const routes = (manifest.routes ?? []).map((r) => r.path);
    return {
        name: manifest.name || folder,
        folder,
        repo,
        sha,
        shortSha: sha.slice(0, 7),
        contracts: (manifest.contracts ?? []).map((c) => c.name),
        actions: (manifest.actions ?? []).map((a) => (typeof a === 'string' ? a : a.name)),
        routes,
        shadowedRoutes: routes.filter((route) => hasProjectRoute(projectRoot, route)),
        hasServerCode: listFiles(pluginDir).some(isScriptFile),
        ...setupRun,
    };
}

/** A project page at the same static path wins over the plugin route (dev-server route merge). */
function hasProjectRoute(projectRoot: string, routePath: string): boolean {
    const pageDir = path.join(projectRoot, 'src', 'pages', ...routePath.split('/').filter(Boolean));
    return fs.existsSync(path.join(pageDir, 'page.jay-html'));
}

/** Repo-relative POSIX paths, skipping `.git`. */
export function listFiles(dir: string, prefix = ''): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === '.git') return [];
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        return entry.isDirectory() ? listFiles(path.join(dir, entry.name), rel) : [rel];
    });
}
