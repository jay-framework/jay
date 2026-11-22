import * as fs from 'node:fs';
import * as path from 'node:path';

export async function agentkit(ctx: { projectRoot: string; pluginName: string }) {
    const file = path.join(ctx.projectRoot, `agent-kit-ran-${ctx.pluginName}.txt`);
    fs.writeFileSync(file, 'ran');
    return { agentKitCreated: [path.basename(file)] };
}
