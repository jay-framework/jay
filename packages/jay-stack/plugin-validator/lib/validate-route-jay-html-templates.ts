import fs from 'fs';
import path from 'path';

import type { PluginContext, ValidationResult } from './types';
import { compileValidateRouteJayHtml } from './validate-route-jay-html';

/**
 * Compile-check every `routes[].jayHtml` template declared in plugin.yaml (DL#73 generate stage).
 */
export async function validateRouteJayHtmlTemplates(
    context: PluginContext,
    result: ValidationResult,
): Promise<void> {
    const routes = context.manifest.routes;
    if (!routes || !Array.isArray(routes)) return;

    for (const route of routes) {
        if (!route.jayHtml) continue;

        const absolutePath = path.resolve(context.pluginPath, route.jayHtml);
        if (!fs.existsSync(absolutePath)) {
            continue;
        }

        const compileErrors = await compileValidateRouteJayHtml(
            absolutePath,
            context.pluginPath,
        );
        const relPath = path.relative(context.pluginPath, absolutePath);

        for (const message of compileErrors) {
            result.errors.push({
                type: 'jay-html-compile',
                message:
                    `Route "${route.path}" jayHtml failed to compile: ${message}`,
                location: relPath,
                suggestion:
                    'Fix the template syntax or run `jay-stack validate -p <dir>` on the source page during development. See agent-kit/designer/jay-html-template-syntax.md',
            });
        }
    }
}
