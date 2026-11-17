import * as fs from 'node:fs';
import * as path from 'node:path';
import YAML from 'yaml';
import type {
    PluginAgentKitContext,
    PluginAgentKitResult,
} from '@jay-framework/stack-server-runtime';
import { readManifest } from './core/manifest';

/**
 * `jay-stack agent-kit` handler: writes `agent-kit/references/share/shared-plugins.yaml` so agents
 * see which src/plugins folders are shared (and must be changed via share/push, not the site repo).
 * The guide itself ships as `agent-kit/developer/share-guide.md` and is merged by agent-kit.
 */
export async function shareAgentKit(ctx: PluginAgentKitContext): Promise<PluginAgentKitResult> {
    const { plugins } = readManifest(ctx.projectRoot);
    if (plugins.length === 0) return { agentKitCreated: [], message: 'No shared plugins.' };
    fs.mkdirSync(ctx.referencesDir, { recursive: true });
    const file = path.join(ctx.referencesDir, 'shared-plugins.yaml');
    const body = {
        note: 'These src/plugins folders are separate git repos shared via share.yaml. Edit them in place, commit inside the folder, then run share/push. See developer/share-guide.md.',
        plugins: plugins.map(({ folder, repo, ref, commit }) => ({ folder, repo, ref, commit })),
    };
    fs.writeFileSync(file, YAML.stringify(body), 'utf-8');
    return {
        agentKitCreated: [path.relative(ctx.projectRoot, file)],
        message: `Listed ${plugins.length} shared plugin(s).`,
    };
}
