/**
 * Setup handler for ui-kit plugin (Design Log #142).
 *
 * Writes AIditor Add Menu catalog: agent-kit/aiditor/add-menu/ui-kit.yaml
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';

const ADD_MENU_OUTPUT_REL = 'agent-kit/aiditor/add-menu/ui-kit.yaml';
const SPRING_SKILL_SOURCE_REL = 'agent-kit/designer/spring-button-hover.md';
const SPRING_SKILL_OUTPUT_REL = 'agent-kit/aiditor/skills/ui-kit/spring-button-hover.md';

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

function writeSpringButtonHoverSkill(ctx: PluginSetupContext): string | null {
    const outputPath = path.join(ctx.projectRoot, SPRING_SKILL_OUTPUT_REL);

    if (fs.existsSync(outputPath) && !ctx.force) {
        return null;
    }

    const sourcePath = resolvePackageAgentKitPath(SPRING_SKILL_SOURCE_REL);
    const skillContent = fs.readFileSync(sourcePath, 'utf-8');

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, skillContent, 'utf-8');

    return SPRING_SKILL_OUTPUT_REL;
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
    const skillCreated = writeSpringButtonHoverSkill(ctx);
    if (skillCreated) {
        configCreated.push(skillCreated);
    }

    const message =
        configCreated.length > 0
            ? 'ui-kit Add Menu catalog and spring-button-hover skill installed.'
            : 'ui-kit Add Menu catalog already present (use --force to rewrite).';

    return {
        status: 'configured',
        message,
        ...(configCreated.length > 0 ? { configCreated } : {}),
    };
}
