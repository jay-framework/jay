/**
 * Setup handler for ui-kit plugin (Design Log #142).
 *
 * Writes AIditor Add Menu catalog: agent-kit/aiditor/add-menu/ui-kit.yaml
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
  PluginSetupContext,
  PluginSetupResult,
} from '@jay-framework/stack-server-runtime';

const ADD_MENU_OUTPUT_REL = 'agent-kit/aiditor/add-menu/ui-kit.yaml';

function resolveAddMenuTemplatePath(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const fromDist = path.join(thisDir, 'agent-kit/aiditor/add-menu.template.yaml');
  if (fs.existsSync(fromDist)) {
    return fromDist;
  }
  return path.join(thisDir, '..', 'agent-kit/aiditor/add-menu.template.yaml');
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

export async function setupUiKit(
  ctx: PluginSetupContext,
): Promise<PluginSetupResult> {
  if (ctx.initError) {
    return {
      status: 'error',
      message: `ui-kit initialization failed: ${ctx.initError.message}`,
    };
  }

  const created = writeAddMenuCatalog(ctx);

  return {
    status: 'configured',
    message: created
      ? 'ui-kit Add Menu catalog installed.'
      : 'ui-kit Add Menu catalog already present (use --force to rewrite).',
    ...(created ? { configCreated: [created] } : {}),
  };
}
