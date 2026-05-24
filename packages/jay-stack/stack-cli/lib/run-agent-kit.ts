import chalk from 'chalk';
import YAML from 'yaml';
import {
    materializeContracts,
    listContracts,
    scanPlugins,
    type PluginsIndex,
} from '@jay-framework/stack-server-runtime';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createViteForCli } from '@jay-framework/dev-server';
import { getLogger } from '@jay-framework/logger';
import { initializeServicesForCli } from './cli-services';

type AgentKitRole = 'designer' | 'developer' | 'plugin' | 'devops';
const ALL_ROLES: AgentKitRole[] = ['designer', 'developer', 'plugin', 'devops'];

export async function runAgentKit(options: {
    output?: string;
    yaml?: boolean;
    list?: boolean;
    plugin?: string;
    dynamicOnly?: boolean;
    force?: boolean;
    references?: boolean;
    mode?: string;
    verbose?: boolean;
}): Promise<void> {
    const projectRoot = process.cwd();
    const { initErrors, viteServer } = await runMaterialize(
        projectRoot,
        options,
        'agent-kit/materialized-contracts',
        true,
    );
    try {
        if (!options.list) {
            await ensureAgentKitDocs(projectRoot, options.force, options.mode);
            await mergePluginAgentKitGuides(projectRoot, options.mode);
            if (options.references !== false) {
                await generatePluginReferences(projectRoot, options, initErrors, viteServer);
            }
        }
    } finally {
        if (viteServer) {
            await viteServer.close();
        }
    }
}

interface RunMaterializeResult {
    initErrors: Map<string, Error>;
    viteServer?: Awaited<ReturnType<typeof createViteForCli>>;
}

async function runMaterialize(
    projectRoot: string,
    options: {
        output?: string;
        yaml?: boolean;
        list?: boolean;
        plugin?: string;
        dynamicOnly?: boolean;
        force?: boolean;
        verbose?: boolean;
    },
    defaultOutputRelative: string,
    keepViteAlive = false,
): Promise<RunMaterializeResult> {
    const outputDir = options.output ?? path.join(projectRoot, defaultOutputRelative);
    let viteServer: Awaited<ReturnType<typeof createViteForCli>> | undefined;
    let initErrors = new Map<string, Error>();

    try {
        if (options.list) {
            const index = await listContracts({
                projectRoot,
                dynamicOnly: options.dynamicOnly,
                pluginFilter: options.plugin,
            });

            if (options.yaml) {
                getLogger().important(YAML.stringify(index));
            } else {
                printContractList(index);
            }
            return { initErrors };
        }

        if (options.verbose) {
            getLogger().info('Starting Vite for TypeScript support...');
        }
        viteServer = await createViteForCli({ projectRoot });

        const { services, initErrors: errors } = await initializeServicesForCli(
            projectRoot,
            viteServer,
        );
        initErrors = errors;

        const result = await materializeContracts(
            {
                projectRoot,
                outputDir,
                force: options.force,
                dynamicOnly: options.dynamicOnly,
                pluginFilter: options.plugin,
                verbose: options.verbose,
                viteServer,
            },
            services,
        );

        if (options.yaml) {
            getLogger().important(YAML.stringify(result.pluginsIndex));
        } else {
            const totalContracts = result.pluginsIndex.plugins.reduce(
                (sum, p) => sum + p.contracts.length,
                0,
            );
            getLogger().important(chalk.green(`\nMaterialized ${totalContracts} contracts`));
            getLogger().important(`   Static: ${result.staticCount}`);
            getLogger().important(`   Dynamic: ${result.dynamicCount}`);
            getLogger().important(`   Output: ${result.outputDir}`);
        }

        return { initErrors, viteServer: keepViteAlive ? viteServer : undefined };
    } catch (error: any) {
        getLogger().error(chalk.red('Failed to materialize contracts:') + ' ' + error.message);
        if (options.verbose) {
            getLogger().error(error.stack);
        }
        process.exit(1);
    } finally {
        if (viteServer && !keepViteAlive) {
            await viteServer.close();
        }
    }

    return { initErrors };
}

async function ensureAgentKitDocs(
    projectRoot: string,
    _force?: boolean,
    mode?: string,
): Promise<void> {
    const agentKitDir = path.join(projectRoot, 'agent-kit');
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const templateDir = path.resolve(thisDir, '..', 'agent-kit-template');

    const roles: AgentKitRole[] =
        mode && ALL_ROLES.includes(mode as AgentKitRole) ? [mode as AgentKitRole] : ALL_ROLES;

    for (const role of roles) {
        const roleTemplateDir = path.join(templateDir, role);
        const roleOutputDir = path.join(agentKitDir, role);

        let files: string[];
        try {
            files = (await fs.readdir(roleTemplateDir)).filter((f) => f.endsWith('.md'));
        } catch {
            continue;
        }

        await fs.mkdir(roleOutputDir, { recursive: true });

        for (const filename of files) {
            await fs.copyFile(
                path.join(roleTemplateDir, filename),
                path.join(roleOutputDir, filename),
            );
            getLogger().info(chalk.gray(`   Created agent-kit/${role}/${filename}`));
        }
    }
}

async function mergePluginAgentKitGuides(projectRoot: string, mode?: string): Promise<void> {
    const plugins = await scanPlugins({ projectRoot });
    const agentKitDir = path.join(projectRoot, 'agent-kit');
    const roles: AgentKitRole[] =
        mode && ALL_ROLES.includes(mode as AgentKitRole) ? [mode as AgentKitRole] : ALL_ROLES;

    const copiedPerRole = new Map<
        string,
        Array<{ filename: string; pluginName: string; description: string }>
    >();

    for (const [, plugin] of plugins) {
        const pluginAgentKitDir = path.join(plugin.pluginPath, 'agent-kit');
        if (!fsSync.existsSync(pluginAgentKitDir)) continue;

        for (const role of roles) {
            const roleSourceDir = path.join(pluginAgentKitDir, role);
            let files: string[];
            try {
                files = (await fs.readdir(roleSourceDir)).filter(
                    (f) => f.endsWith('.md') && f !== 'INSTRUCTIONS.md',
                );
            } catch {
                continue;
            }
            if (files.length === 0) continue;

            const roleOutputDir = path.join(agentKitDir, role);
            await fs.mkdir(roleOutputDir, { recursive: true });

            for (const filename of files) {
                const sourcePath = path.join(roleSourceDir, filename);
                await fs.copyFile(sourcePath, path.join(roleOutputDir, filename));

                let description = '';
                try {
                    const content = await fs.readFile(sourcePath, 'utf-8');
                    const lines = content.split('\n');
                    let pastHeading = false;
                    for (const line of lines) {
                        if (line.startsWith('# ')) {
                            pastHeading = true;
                            continue;
                        }
                        if (pastHeading && line.trim()) {
                            description = line.trim();
                            break;
                        }
                    }
                } catch {
                    /* skip */
                }

                if (!copiedPerRole.has(role)) copiedPerRole.set(role, []);
                copiedPerRole.get(role)!.push({ filename, pluginName: plugin.name, description });
                getLogger().info(
                    chalk.gray(
                        `   Copied agent-kit/${role}/${filename} from plugin "${plugin.name}"`,
                    ),
                );
            }
        }
    }

    for (const [role, entries] of copiedPerRole) {
        const instructionsPath = path.join(agentKitDir, role, 'INSTRUCTIONS.md');
        if (!fsSync.existsSync(instructionsPath)) continue;

        const lines = [
            '',
            '## Plugin-Contributed Guides',
            '',
            '| File | Plugin | Description |',
            '| --- | --- | --- |',
        ];
        for (const { filename, pluginName, description } of entries) {
            lines.push(`| [${filename}](${filename}) | ${pluginName} | ${description} |`);
        }
        lines.push('');

        await fs.appendFile(instructionsPath, lines.join('\n'));
    }
}

async function generatePluginReferences(
    projectRoot: string,
    options: { plugin?: string; force?: boolean; verbose?: boolean },
    initErrors: Map<string, Error>,
    viteServer?: Awaited<ReturnType<typeof createViteForCli>>,
): Promise<void> {
    const { discoverPluginsWithReferences, executePluginReferences } = await import(
        '@jay-framework/stack-server-runtime'
    );

    const plugins = await discoverPluginsWithReferences({
        projectRoot,
        verbose: options.verbose,
        pluginFilter: options.plugin,
    });

    if (plugins.length === 0) return;

    const logger = getLogger();
    logger.important('');
    logger.important(chalk.bold('Generating plugin references...'));

    for (const plugin of plugins) {
        const pluginInitError = initErrors.get(plugin.name);
        if (pluginInitError) {
            logger.warn(
                chalk.yellow(
                    `   ${plugin.name}: references skipped — init failed: ${pluginInitError.message}`,
                ),
            );
            continue;
        }

        try {
            const result = await executePluginReferences(plugin, {
                projectRoot,
                force: options.force ?? false,
                viteServer,
                verbose: options.verbose,
            });

            if (result.referencesCreated.length > 0) {
                logger.important(chalk.green(`   ${plugin.name}:`));
                for (const ref of result.referencesCreated) {
                    logger.important(chalk.gray(`      ${ref}`));
                }
                if (result.message) {
                    logger.important(chalk.gray(`      ${result.message}`));
                }
            }
        } catch (error: any) {
            logger.warn(chalk.yellow(`   ${plugin.name}: references skipped — ${error.message}`));
        }
    }
}

function printContractList(index: PluginsIndex): void {
    const logger = getLogger();
    logger.important('\nAvailable Contracts:\n');

    for (const plugin of index.plugins) {
        logger.important(chalk.bold(plugin.name));
        for (const contract of plugin.contracts) {
            const typeIcon = contract.type === 'static' ? 'static' : 'dynamic';
            logger.important(`   [${typeIcon}] ${contract.name}`);
        }
        logger.important('');
    }

    if (index.plugins.length === 0) {
        logger.important(chalk.gray('No contracts found.'));
    }
}
