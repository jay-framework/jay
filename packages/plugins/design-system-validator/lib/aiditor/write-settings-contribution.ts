import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AIDITOR_SETTINGS_OUTPUT_REL =
    'agent-kit/aiditor/settings/design-system-validator.yaml';

const SETTINGS_TEMPLATE_REL = 'agent-kit/aiditor/settings.template.yaml';

/**
 * Resolve a file shipped inside the plugin package (agent-kit templates, etc.).
 *
 * Works when this module is bundled to `dist/index.js` (walk up to package root)
 * and when Vitest loads `lib/aiditor/*.ts` directly (walk up through lib/).
 */
export function resolvePackagedAgentKitPath(
    relativePath: string,
    moduleUrl: string = import.meta.url,
): string | null {
    let directory = path.dirname(fileURLToPath(moduleUrl));
    for (let depth = 0; depth < 4; depth++) {
        const candidate = path.join(directory, relativePath);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parent = path.dirname(directory);
        if (parent === directory) {
            break;
        }
        directory = parent;
    }
    return null;
}

export function writeAiditorSettingsContribution(
    projectRoot: string,
    templatePath: string,
    force = false,
): string | null {
    const outputPath = path.join(projectRoot, AIDITOR_SETTINGS_OUTPUT_REL);
    if (fs.existsSync(outputPath) && !force) {
        return null;
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(templatePath, outputPath);
    return AIDITOR_SETTINGS_OUTPUT_REL;
}

export function materializeDesignSystemAiditorSettings(
    projectRoot: string,
    force = false,
): string | null {
    const templatePath = resolvePackagedAgentKitPath(SETTINGS_TEMPLATE_REL);
    if (!templatePath) {
        return null;
    }
    return writeAiditorSettingsContribution(projectRoot, templatePath, force);
}
