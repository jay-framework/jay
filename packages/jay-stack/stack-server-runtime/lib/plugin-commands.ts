/**
 * Plugin CLI Commands (Design Log #142)
 *
 * Plugins expose CLI commands via `commands` in plugin.yaml.
 * Each command has a `makeCliCommand` handler and an optional `.jay-command` metadata file.
 * Run via `jay-stack run <plugin>/<command>`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import { scanPlugins } from './plugin-scanner';
import { resolveServices } from './services';
import { isJayCliCommand, type JayCliCommand } from '@jay-framework/fullstack-component';
import type { ViteSSRLoader } from './action-discovery';
import { getLogger } from '@jay-framework/logger';

// ============================================================================
// Types
// ============================================================================

export interface CommandMetadata {
    name: string;
    description?: string;
    inputSchema?: Record<string, string>;
}

export interface DiscoveredCommand {
    pluginName: string;
    pluginPath: string;
    packageName: string;
    isLocal: boolean;
    commandName: string;
    handlerExport: string;
    pluginModule?: string;
    metadata?: CommandMetadata;
    metadataPath?: string;
}

export interface CommandFlag {
    flag: string;
    description: string;
    required: boolean;
    type: 'string' | 'boolean' | 'number';
}

// ============================================================================
// Discovery
// ============================================================================

export async function discoverPluginCommands(options: {
    projectRoot: string;
    verbose?: boolean;
    pluginFilter?: string;
}): Promise<DiscoveredCommand[]> {
    const { projectRoot, verbose, pluginFilter } = options;

    const allPlugins = await scanPlugins({
        projectRoot,
        verbose,
        discoverTransitive: true,
        includeDevDeps: true,
    });

    const commands: DiscoveredCommand[] = [];

    for (const [packageName, plugin] of allPlugins) {
        if (!plugin.manifest.commands || plugin.manifest.commands.length === 0) continue;

        if (pluginFilter && plugin.name !== pluginFilter && packageName !== pluginFilter) {
            continue;
        }

        for (const cmd of plugin.manifest.commands) {
            let metadata: CommandMetadata | undefined;
            let metadataPath: string | undefined;

            if (cmd.command) {
                metadataPath = path.resolve(plugin.pluginPath, cmd.command);
                metadata = loadCommandMetadata(metadataPath);
            }

            commands.push({
                pluginName: plugin.name,
                pluginPath: plugin.pluginPath,
                packageName: plugin.packageName,
                isLocal: plugin.isLocal,
                commandName: cmd.name,
                handlerExport: cmd.name,
                pluginModule: plugin.manifest.module,
                metadata,
                metadataPath,
            });

            if (verbose) {
                getLogger().info(`[Commands] Found ${plugin.name}/${cmd.name}`);
            }
        }
    }

    return commands;
}

// ============================================================================
// Metadata Loading
// ============================================================================

function loadCommandMetadata(filePath: string): CommandMetadata | undefined {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return YAML.parse(content) as CommandMetadata;
    } catch {
        return undefined;
    }
}

// ============================================================================
// Schema → CLI Flags
// ============================================================================

export function commandSchemaToFlags(inputSchema: Record<string, string>): CommandFlag[] {
    const flags: CommandFlag[] = [];

    for (const [field, type] of Object.entries(inputSchema)) {
        const isOptional = field.endsWith('?');
        const cleanName = isOptional ? field.slice(0, -1) : field;
        const kebabName = camelToKebab(cleanName);
        const cleanType = type.toLowerCase().trim();

        const isBoolean = cleanType === 'boolean';

        flags.push({
            flag: isBoolean ? `--${kebabName}` : `--${kebabName} <value>`,
            description: '',
            required: !isOptional,
            type: cleanType === 'number' ? 'number' : isBoolean ? 'boolean' : 'string',
        });
    }

    return flags;
}

function camelToKebab(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function parseInputFromFlags(
    rawOptions: Record<string, any>,
    schema: Record<string, string>,
): Record<string, any> {
    const input: Record<string, any> = {};

    for (const [field, type] of Object.entries(schema)) {
        const isOptional = field.endsWith('?');
        const cleanName = isOptional ? field.slice(0, -1) : field;
        const kebabName = camelToKebab(cleanName);

        const value = rawOptions[kebabName];
        if (value === undefined) {
            if (!isOptional) {
                throw new Error(`Missing required flag: --${kebabName}`);
            }
            continue;
        }

        const cleanType = type.toLowerCase().trim();
        if (cleanType === 'number') {
            const parsed = Number(value);
            if (isNaN(parsed)) throw new Error(`Flag --${kebabName} must be a number`);
            input[cleanName] = parsed;
        } else if (cleanType === 'boolean') {
            input[cleanName] = value === true || value === 'true';
        } else {
            input[cleanName] = String(value);
        }
    }

    return input;
}

// ============================================================================
// Execution
// ============================================================================

export async function executePluginCommand(
    command: DiscoveredCommand,
    input: Record<string, any>,
    viteServer?: ViteSSRLoader,
): Promise<{ success: boolean }> {
    const cliCommand = await loadCommandHandler(command, viteServer);
    const services = resolveServices(cliCommand.services);
    return cliCommand.handler(input, ...services);
}

async function loadCommandHandler(
    command: DiscoveredCommand,
    viteServer?: ViteSSRLoader,
): Promise<JayCliCommand<any>> {
    let module: any;

    if (command.isLocal) {
        const moduleFile = command.pluginModule || 'index';
        const modulePath = path.resolve(command.pluginPath, moduleFile);
        if (viteServer) {
            module = await viteServer.ssrLoadModule(modulePath);
        } else {
            module = await import(modulePath);
        }
    } else {
        if (viteServer) {
            module = await viteServer.ssrLoadModule(command.packageName);
        } else {
            module = await import(command.packageName);
        }
    }

    // Find the command export by iterating exports and matching commandName
    for (const [, exported] of Object.entries(module)) {
        if (isJayCliCommand(exported) && exported.commandName === command.commandName) {
            return exported;
        }
    }

    // Also try by export name directly
    const byName = module[command.handlerExport];
    if (byName && isJayCliCommand(byName)) {
        return byName;
    }

    throw new Error(
        `CLI command "${command.commandName}" not found as export in "${command.isLocal ? command.pluginPath : command.packageName}". ` +
            `Available exports: ${Object.keys(module).join(', ')}`,
    );
}
