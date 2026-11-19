import { validatePlugin } from '@jay-framework/plugin-validator';
import { createGitRunner, type GitRunner } from './git-runner';
import { defaultPluginHandlers, type PluginHandlers } from './plugin-handlers';

/** Everything a flow needs; tests replace the git runner (URL rewrite) and the handler seams. */
export interface ShareContext {
    projectRoot: string;
    git: GitRunner;
    handlers: PluginHandlers;
    /** `validate-plugin --local`; returns error messages (empty = valid). */
    validateLocalPlugins(projectRoot: string): Promise<string[]>;
}

export function createShareContext(
    projectRoot: string,
    overrides: Partial<ShareContext> = {},
): ShareContext {
    return {
        projectRoot,
        git: createGitRunner(),
        handlers: defaultPluginHandlers,
        validateLocalPlugins: validateLocalPluginsWithValidator,
        ...overrides,
    };
}

async function validateLocalPluginsWithValidator(projectRoot: string): Promise<string[]> {
    const result = await validatePlugin({ pluginPath: projectRoot, local: true });
    return result.errors.map((e) => `${e.location ?? ''} ${e.message}`.trim());
}
