import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { input } from '@inquirer/prompts';
import { runPrompts } from './prompts.js';
import { scaffoldProject } from './scaffold.js';

function detectPackageManager(): 'yarn' | 'npm' {
    const agent = process.env.npm_config_user_agent || '';
    if (agent.startsWith('yarn')) return 'yarn';
    return 'npm';
}

function run(cmd: string, cwd: string): void {
    execSync(cmd, { cwd, stdio: 'inherit' });
}

function hasWixPlugins(selectedPlugins: { name: string }[]): boolean {
    return selectedPlugins.some((p) => p.name.startsWith('@jay-framework/wix-'));
}

async function promptWixApiKey(): Promise<string> {
    console.log('');
    console.log(chalk.bold('  Wix Setup'));
    console.log('');
    console.log(
        chalk.dim(
            '  Wix plugins require API credentials. Create an API key at:',
        ),
    );
    console.log(chalk.cyan('  https://manage.wix.com/account/api-keys'));
    console.log('');

    return input({
        message: 'Wix API Key:',
        validate: (v) => (v.trim() ? true : 'API key is required'),
    });
}

async function setupWix(projectDir: string, apiKey: string): Promise<void> {
    console.log(chalk.dim('  Connecting to your Wix site...'));
    try {
        run('npm create @wix/new@latest init', projectDir);
    } catch {
        console.log(chalk.yellow('  ⚠ Wix site init failed — you can run it manually later'));
        return;
    }

    const wixConfigPath = path.join(projectDir, 'wix.config.json');
    if (!fs.existsSync(wixConfigPath)) {
        console.log(chalk.yellow('  ⚠ wix.config.json not created — skipping credential setup'));
        return;
    }

    let siteId = '';
    let appId = '';
    try {
        const wixConfig = JSON.parse(fs.readFileSync(wixConfigPath, 'utf-8'));
        siteId = wixConfig.siteId || '';
        appId = wixConfig.appId || '';
    } catch {
        console.log(chalk.yellow('  ⚠ Could not parse wix.config.json'));
        return;
    }

    if (!siteId || !appId) {
        console.log(chalk.yellow('  ⚠ Missing siteId or appId in wix.config.json'));
        return;
    }

    const configDir = path.join(projectDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
        path.join(configDir, '.wix.yaml'),
        `# Wix API Configuration
#
# This file contains credentials for connecting to your Wix site.
# Get these values from your Wix dashboard:
#   - API Key: https://dev.wix.com/docs/rest/articles/getting-started/api-keys
#   - Site ID: Found in your Wix dashboard URL or site settings
#   - OAuth Client ID: Create an OAuth app in Wix Developers dashboard
#
# IMPORTANT: This file contains secrets. Add config/.wix.yaml to .gitignore.

# Server-side authentication (required)
apiKeyStrategy:
  apiKey: "${apiKey.trim()}"
  siteId: "${siteId}"

# Client-side authentication (required for interactive features)
oauthStrategy:
  clientId: "${appId}"
`,
        'utf-8',
    );

    // Ensure .gitignore excludes credentials and generated config
    const gitignorePath = path.join(projectDir, '.gitignore');
    const gitignoreEntries = ['config/.wix.yaml', 'wix.config.json'];
    if (fs.existsSync(gitignorePath)) {
        let content = fs.readFileSync(gitignorePath, 'utf-8');
        for (const entry of gitignoreEntries) {
            if (!content.includes(entry)) {
                content += `\n${entry}`;
            }
        }
        fs.writeFileSync(gitignorePath, content.trimEnd() + '\n', 'utf-8');
    } else {
        fs.writeFileSync(
            gitignorePath,
            `node_modules\ndist\nbuild\n${gitignoreEntries.join('\n')}\n`,
            'utf-8',
        );
    }

    console.log(chalk.green('  ✓ Wix credentials configured'));
}

async function main(): Promise<void> {
    const pm = detectPackageManager();

    console.log('');
    console.log(chalk.bold('  Create Jay Stack Project'));
    console.log('');

    const config = await runPrompts();
    const projectDir = path.resolve(process.cwd(), config.name);

    console.log('');
    console.log(`Creating project in ${chalk.cyan(`./${config.name}`)}...`);

    const wixSelected = hasWixPlugins(config.selectedPlugins);
    const wixApiKey = wixSelected ? await promptWixApiKey() : '';

    scaffoldProject(projectDir, config.name, config.selectedPlugins);
    console.log(chalk.green('  ✓ Created project structure'));

    console.log(chalk.dim('  Installing dependencies...'));
    run(pm === 'yarn' ? 'yarn install' : 'npm install', projectDir);
    console.log(chalk.green('  ✓ Installed dependencies'));

    if (wixSelected) {
        await setupWix(projectDir, wixApiKey);
    }

    console.log(chalk.dim('  Generating agent-kit...'));
    try {
        run('npx jay-stack-cli agent-kit', projectDir);
        console.log(chalk.green('  ✓ Generated agent-kit'));
    } catch {
        console.log(
            chalk.yellow(
                '  ⚠ Agent-kit generation skipped (can run later with: npm run agent-kit)',
            ),
        );
    }

    console.log(chalk.dim('  Running plugin setup...'));
    try {
        run('npx jay-stack-cli setup', projectDir);
        console.log(chalk.green('  ✓ Plugin setup complete'));
    } catch {
        console.log(chalk.yellow('  ⚠ Setup incomplete (can run later with: npm run setup)'));
    }

    const runCmd = pm === 'yarn' ? 'yarn dev' : 'npm run dev';

    console.log('');
    console.log(chalk.bold('  Ready!'));
    console.log('');
    console.log(`  ${chalk.cyan(`cd ${config.name}`)}`);
    console.log(`  ${chalk.cyan(runCmd)}`);
    console.log('');
}

main().catch((err) => {
    if (err.message?.includes('User force closed')) {
        console.log('\nAborted.');
        process.exit(0);
    }
    console.error(chalk.red('Error:'), err.message);
    process.exit(1);
});
