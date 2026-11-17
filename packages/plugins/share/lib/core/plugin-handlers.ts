import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import {
    discoverPluginsWithAgentKit,
    discoverPluginsWithSetup,
    executePluginAgentKit,
    executePluginSetup,
    SetupNeedsAnswerError,
    type ViteSSRLoader,
} from '@jay-framework/stack-server-build';
import type { PluginSetupPrompt } from '@jay-framework/stack-server-runtime';
import { createViteForCli } from '@jay-framework/dev-server';
import type { SetupOutcome, SetupQuestion } from './types';
import { pluginFolderPath } from './manifest';

export interface SetupRun {
    setup: SetupOutcome;
    setupMessage?: string;
    setupQuestion?: SetupQuestion;
}

/**
 * Runs a linked plugin's setup + agent-kit handlers after its files are in `src/plugins/<folder>`
 * (DL#237 § "Setup + agent-kit"). A seam so flow tests can spy on it.
 */
export interface PluginHandlers {
    runSetupAndAgentKit(projectRoot: string, folder: string): Promise<SetupRun>;
}

export const defaultPluginHandlers: PluginHandlers = {
    runSetupAndAgentKit: (projectRoot, folder) =>
        withCliVite(projectRoot, (vite) => runHandlers(projectRoot, folder, vite)),
};

/** Local handlers are relative `.ts` files, loadable only through a Vite SSR loader. */
async function withCliVite<T>(
    projectRoot: string,
    work: (vite: ViteSSRLoader) => Promise<T>,
): Promise<T> {
    const vite = await createViteForCli({ projectRoot });
    try {
        return await work(vite);
    } finally {
        await vite.close();
    }
}

async function runHandlers(
    projectRoot: string,
    folder: string,
    viteServer: ViteSSRLoader,
): Promise<SetupRun> {
    const pluginPath = path.resolve(pluginFolderPath(projectRoot, folder));
    const setupRun = await runSetup(projectRoot, pluginPath, viteServer);
    const agentKitPlugin = (await discoverPluginsWithAgentKit({ projectRoot })).find(
        (p) => path.resolve(p.pluginPath) === pluginPath,
    );
    if (agentKitPlugin) {
        await executePluginAgentKit(agentKitPlugin, { projectRoot, force: false, viteServer });
    }
    return setupRun;
}

async function runSetup(
    projectRoot: string,
    pluginPath: string,
    viteServer: ViteSSRLoader,
): Promise<SetupRun> {
    const plugin = (await discoverPluginsWithSetup({ projectRoot })).find(
        (p) => path.resolve(p.pluginPath) === pluginPath,
    );
    if (!plugin) return { setup: 'none' };
    try {
        const result = await executePluginSetup(plugin, {
            projectRoot,
            configDir: path.resolve(projectRoot, readConfigBase(projectRoot)),
            force: false,
            interactive: false,
            prompt: createThrowingPrompt(plugin.name),
            viteServer,
        });
        return { setup: result.status, setupMessage: result.message };
    } catch (error) {
        if (error instanceof SetupNeedsAnswerError) {
            return {
                setup: 'needs-answer',
                setupMessage: error.message,
                setupQuestion: {
                    key: error.key,
                    type: error.type,
                    message: error.promptMessage,
                    ...(error.choices && { choices: error.choices }),
                },
            };
        }
        return {
            setup: 'error',
            setupMessage: error instanceof Error ? error.message : String(error),
        };
    }
}

/** Share never prompts: any question a setup handler asks becomes `needs-answer`. */
export function createThrowingPrompt(pluginName: string): PluginSetupPrompt {
    return {
        input: async ({ key, message }) => {
            throw new SetupNeedsAnswerError(pluginName, key, 'input', message);
        },
        confirm: async ({ key, message }) => {
            throw new SetupNeedsAnswerError(pluginName, key, 'confirm', message);
        },
        select: async ({ key, message, choices }) => {
            throw new SetupNeedsAnswerError(pluginName, key, 'select', message, choices);
        },
    };
}

/** `devServer.configBase` from the project `.jay` file (same default as stack-cli's loadConfig). */
function readConfigBase(projectRoot: string): string {
    const configFile = path.join(projectRoot, '.jay');
    if (!fs.existsSync(configFile)) return './config';
    try {
        return (
            YAML.parse(fs.readFileSync(configFile, 'utf-8'))?.devServer?.configBase || './config'
        );
    } catch {
        return './config';
    }
}
