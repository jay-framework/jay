import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_DEPS, CORE_DEV_DEPS, type PluginEntry } from './plugins.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function templatesDir(): string {
    const fromDist = path.join(__dirname, '..', 'templates');
    if (fs.existsSync(fromDist)) return fromDist;
    return path.join(__dirname, 'templates');
}

function readTemplate(name: string): string {
    return fs.readFileSync(path.join(templatesDir(), name), 'utf-8');
}

function writeFile(projectDir: string, relativePath: string, content: string): void {
    const fullPath = path.join(projectDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
}

function generatePackageJson(name: string, selectedPlugins: PluginEntry[]): string {
    const deps: Record<string, string> = {};
    for (const dep of CORE_DEPS) {
        deps[dep] = 'latest';
    }
    for (const plugin of selectedPlugins) {
        if (plugin.isDep) deps[plugin.name] = 'latest';
    }

    const devDeps: Record<string, string> = {};
    for (const dep of CORE_DEV_DEPS) {
        devDeps[dep] = 'latest';
    }
    for (const plugin of selectedPlugins) {
        if (!plugin.isDep) devDeps[plugin.name] = 'latest';
    }

    const pkg = {
        name,
        version: '0.1.0',
        type: 'module',
        private: true,
        scripts: {
            dev: 'jay-stack dev',
            build: 'jay-cli definitions src && jay-stack build',
            serve: 'jay-stack serve',
            validate: 'jay-stack validate',
            'agent-kit': 'jay-stack agent-kit',
            setup: 'jay-stack setup',
            clean: 'rimraf dist && rimraf build',
        },
        dependencies: sortKeys(deps),
        devDependencies: sortKeys(devDeps),
    };

    return JSON.stringify(pkg, null, 2) + '\n';
}

function sortKeys(obj: Record<string, string>): Record<string, string> {
    const sorted: Record<string, string> = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = obj[key];
    }
    return sorted;
}

export function scaffoldProject(
    projectDir: string,
    name: string,
    selectedPlugins: PluginEntry[],
): void {
    fs.mkdirSync(projectDir, { recursive: true });

    writeFile(projectDir, 'package.json', generatePackageJson(name, selectedPlugins));
    writeFile(
        projectDir,
        'src/pages/page.jay-html',
        readTemplate('page.jay-html').replace(/\{\{name\}\}/g, name),
    );
    writeFile(projectDir, 'src/pages/page.ts', readTemplate('page.ts'));
    writeFile(projectDir, 'src/pages/page.jay-contract', readTemplate('page.jay-contract'));
    writeFile(projectDir, 'src/styles/theme.css', readTemplate('theme.css'));
    writeFile(projectDir, '.jay', readTemplate('jay-config.yaml'));
    writeFile(projectDir, 'vite.config.ts', readTemplate('vite.config.ts'));
    writeFile(projectDir, 'tsconfig.json', readTemplate('tsconfig.json'));

    const jaySkillPath = path.join(templatesDir(), 'jay-skill.md');
    if (fs.existsSync(jaySkillPath)) {
        writeFile(projectDir, 'jay-skill.md', fs.readFileSync(jaySkillPath, 'utf-8'));
    }

    const hasDesignValidator = selectedPlugins.some(
        (p) => p.name === '@jay-framework/design-system-validator',
    );
    if (hasDesignValidator) {
        writeFile(projectDir, 'DESIGN.md', readTemplate('DESIGN.md'));
    }
}
