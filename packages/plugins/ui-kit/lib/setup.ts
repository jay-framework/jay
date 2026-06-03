/**
 * Setup handler for ui-kit plugin (Design Log #142).
 *
 * Writes AIditor Add Menu catalog: agent-kit/aiditor/add-menu/ui-kit.yaml
 * Copies effect skill markdown into agent-kit/aiditor/skills/ui-kit/
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';

const ADD_MENU_OUTPUT_REL = 'agent-kit/aiditor/add-menu/ui-kit.yaml';

/** Designer guide source → project skill path (AIditor add-menu prompts reference skills/). */
const AIDITOR_SKILL_COPIES: ReadonlyArray<{ sourceRel: string; outputRel: string }> = [
    {
        sourceRel: 'agent-kit/designer/spring-button-hover.md',
        outputRel: 'agent-kit/aiditor/skills/ui-kit/spring-button-hover.md',
    },
    {
        sourceRel: 'agent-kit/designer/sticky-header-scroll.md',
        outputRel: 'agent-kit/aiditor/skills/ui-kit/sticky-header-scroll.md',
    },
];

function resolvePackageAgentKitPath(relativePath: string): string {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const fromDist = path.join(thisDir, relativePath);
    if (fs.existsSync(fromDist)) {
        return fromDist;
    }
    return path.join(thisDir, '..', relativePath);
}

function resolveAddMenuTemplatePath(): string {
    return resolvePackageAgentKitPath('agent-kit/aiditor/add-menu.template.yaml');
}

function writeAiditorSkills(ctx: PluginSetupContext): string[] {
    const created: string[] = [];

    for (const { sourceRel, outputRel } of AIDITOR_SKILL_COPIES) {
        const outputPath = path.join(ctx.projectRoot, outputRel);

        if (fs.existsSync(outputPath) && !ctx.force) {
            continue;
        }

        const sourcePath = resolvePackageAgentKitPath(sourceRel);
        const skillContent = fs.readFileSync(sourcePath, 'utf-8');

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, skillContent, 'utf-8');
        created.push(outputRel);
    }

    return created;
}

function writeAddMenuCatalog(ctx: PluginSetupContext): string | null {
    const outputPath = path.join(ctx.projectRoot, ADD_MENU_OUTPUT_REL);

    if (fs.existsSync(outputPath) && !ctx.force) {
        return null;
    }

    const templatePath = resolveAddMenuTemplatePath();
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, templateContent, 'utf-8');

    return ADD_MENU_OUTPUT_REL;
}

export async function setupUiKit(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `ui-kit initialization failed: ${ctx.initError.message}`,
        };
    }

    const configCreated: string[] = [];
    const addMenuCreated = writeAddMenuCatalog(ctx);
    if (addMenuCreated) {
        configCreated.push(addMenuCreated);
    }
    configCreated.push(...writeAiditorSkills(ctx));

    const message =
        configCreated.length > 0
            ? 'ui-kit Add Menu catalog and effect skills installed.'
            : 'ui-kit Add Menu catalog already present (use --force to rewrite).';

    return {
        status: 'configured',
        message,
        ...(configCreated.length > 0 ? { configCreated } : {}),
    };
}
