import path from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { runPrompts } from './prompts.js';
import { scaffoldProject } from './scaffold.js';
import { PLUGINS } from './plugins.js';

function detectPackageManager(): 'yarn' | 'npm' {
    const agent = process.env.npm_config_user_agent || '';
    if (agent.startsWith('yarn')) return 'yarn';
    return 'npm';
}

function run(cmd: string, cwd: string): void {
    execSync(cmd, { cwd, stdio: 'inherit' });
}

function parseArgs(): { name?: string; plugins?: string } {
    const args = process.argv.slice(2);
    const result: { name?: string; plugins?: string } = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--name' && args[i + 1]) {
            result.name = args[++i];
        } else if (args[i] === '--plugins' && args[i + 1]) {
            result.plugins = args[++i];
        }
    }
    return result;
}

async function main(): Promise<void> {
    const pm = detectPackageManager();
    const cliArgs = parseArgs();
    const isNonInteractive = !!(cliArgs.name && cliArgs.plugins !== undefined);

    console.log('');
    console.log(chalk.bold('  Create Jay Stack Project'));
    console.log('');

    let name: string;
    let selectedPlugins: typeof PLUGINS;

    if (isNonInteractive) {
        name = cliArgs.name!;
        const requested = cliArgs.plugins
            ? cliArgs.plugins.split(',').map((s) => s.trim())
            : [];
        selectedPlugins = PLUGINS.filter(
            (p) => requested.includes(p.name) || requested.includes(p.label.toLowerCase()),
        );
    } else {
        const config = await runPrompts();
        name = config.name;
        selectedPlugins = config.selectedPlugins;
    }

    const projectDir = path.resolve(process.cwd(), name);

    console.log('');
    console.log(`Creating project in ${chalk.cyan(`./${name}`)}...`);

    scaffoldProject(projectDir, name, selectedPlugins);
    console.log(chalk.green('  ✓ Created project structure'));

    console.log(chalk.dim('  Installing dependencies...'));
    run(pm === 'yarn' ? 'yarn install' : 'npm install', projectDir);
    console.log(chalk.green('  ✓ Installed dependencies'));

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

    const setupFlag = isNonInteractive ? '' : ' --interactive';
    console.log(chalk.dim('  Running plugin setup...'));
    try {
        run(`npx jay-stack-cli setup${setupFlag}`, projectDir);
        console.log(chalk.green('  ✓ Plugin setup complete'));
    } catch {
        console.log(chalk.yellow('  ⚠ Setup incomplete (can run later with: npm run setup)'));
    }

    const runCmd = pm === 'yarn' ? 'yarn dev' : 'npm run dev';

    console.log('');
    console.log(chalk.bold('  Ready!'));
    console.log('');
    console.log(`  ${chalk.cyan(`cd ${name}`)}`);
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
