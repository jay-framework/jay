import * as fs from 'fs';
import * as path from 'path';
import type { PluginSetupContext } from '@jay-framework/stack-server-runtime';

const PUBLIC_THUMBNAIL_ROOT = path.join('public', 'aiditor-add-menu-thumbnails');

/** Copy bundled Add Menu thumbnails into project public/ for dev-server static hosting. */
export function copyAiditorAddMenuThumbnails(
    ctx: PluginSetupContext,
    resolvePackagePath: (relativePath: string) => string,
    pluginName: string,
): string[] {
    const sourceDir = resolvePackagePath(
        path.join('agent-kit', 'aiditor', 'thumbnails', pluginName),
    );
    if (!fs.existsSync(sourceDir)) return [];

    const destDir = path.join(ctx.projectRoot, PUBLIC_THUMBNAIL_ROOT, pluginName);
    const created: string[] = [];

    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const src = path.join(sourceDir, entry.name);
        const dest = path.join(destDir, entry.name);
        if (!fs.existsSync(dest) || ctx.force) {
            fs.copyFileSync(src, dest);
            created.push(path.posix.join(PUBLIC_THUMBNAIL_ROOT, pluginName, entry.name));
        }
    }

    return created;
}
