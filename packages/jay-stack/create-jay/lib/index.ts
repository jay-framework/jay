import path from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
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

async function main(): Promise<void> {
    const pm = detectPackageManager();

    console.log('');
    console.log(chalk.bold('  Create Jay Stack Project'));
    console.log('');

    const config = await runPrompts();
    const projectDir = path.resolve(process.cwd(), config.name);

    console.log('');
    console.log(`Creating project in ${chalk.cyan(`./${config.name}`)}...`);

    scaffoldProject(projectDir, config.name, config.selectedPlugins);
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

    console.log(chalk.dim('  Running plugin setup...'));
    try {
        run('npx jay-stack-cli setup --interactive', projectDir);
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
