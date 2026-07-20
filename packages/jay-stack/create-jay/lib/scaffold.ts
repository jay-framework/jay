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
    const deps: Record<string, string> = { ...CORE_DEPS };
    for (const plugin of selectedPlugins) {
        if (plugin.isDep) deps[plugin.name] = 'latest';
    }

    const devDeps: Record<string, string> = { ...CORE_DEV_DEPS };
    for (const plugin of selectedPlugins) {
        if (!plugin.isDep) devDeps[plugin.name] = 'latest';
    }

    const hasWixDeploy = selectedPlugins.some((p) => p.name === '@jay-framework/wix-deploy');
    const hasAiditor = true;

    const pkg = {
        name,
        version: '0.1.0',
        type: 'module',
        private: true,
        scripts: {
            setup: 'jay-stack-cli setup',
            dev: 'jay-stack-cli dev',
            'agent-kit': 'jay-stack-cli agent-kit',
            validate: 'jay-stack-cli validate',
            clean: "rimraf dist && rimraf build && rimraf -g 'src/**/*.d.ts'",
            definitions: 'jay-cli definitions src',
            build: 'npm run agent-kit && npm run definitions',
            'build:production': 'npm run build && jay-stack-cli build',
            'build:check-types': 'tsc',
            serve: 'jay-stack-cli serve',
            ...(hasWixDeploy && {
                'wix:deploy': 'jay-stack-cli run wix-deploy/deploy --exclude-plugins aiditor',
                'wix:serve': 'node serve.mjs',
            }),
            ...(hasAiditor && {
                'aiditor:publish': hasWixDeploy
                    ? 'npm run build:production && npm run wix:deploy'
                    : "npm run build:production && echo 'add your deploy command here'",
            }),
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

    writeFile(projectDir, 'CLAUDE.md', readTemplate('CLAUDE.md'));

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
