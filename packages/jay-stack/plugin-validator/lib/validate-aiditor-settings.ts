import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

import {
    validateAiditorSettingsFile,
    type AiditorSettingsValidationError,
} from './aiditor-settings-lint';
import type { PluginManifest } from '@jay-framework/compiler-shared';
import type { PluginContext, ValidationResult } from './types';

/** Relative path where plugins ship the AIditor settings template. */
export const AIDITOR_SETTINGS_TEMPLATE_REL_PATH = 'agent-kit/aiditor/settings.template.yaml';

function mapSchemaError(error: AiditorSettingsValidationError, relPath: string) {
    return {
        type: 'schema' as const,
        message: error.message,
        location: error.path || relPath,
        code: error.code,
    };
}

function validateSettingsTemplateAtPath(
    catalogPath: string,
    relPath: string,
    result: ValidationResult,
    manifest: PluginManifest,
): void {
    let parsed: unknown;
    try {
        parsed = YAML.parse(fs.readFileSync(catalogPath, 'utf-8'));
    } catch (err) {
        result.errors.push({
            type: 'schema',
            message: `Invalid YAML in ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
            location: relPath,
        });
        return;
    }

    const validated = validateAiditorSettingsFile(parsed, relPath);
    result.errors.push(...validated.errors.map((error) => mapSchemaError(error, relPath)));

    if (!validated.file) {
        return;
    }

    const routeEntry = manifest.routes?.find((route) => route.path === validated.file!.route);
    if (!routeEntry) {
        result.warnings.push({
            type: 'schema',
            message: `settings route "${validated.file.route}" is not declared in plugin.yaml routes[]`,
            location: relPath,
            code: 'settings-route-missing',
            suggestion: 'Add a matching routes[] entry or fix the route in settings.template.yaml',
        });
    } else if (routeEntry.devOnly !== true) {
        result.warnings.push({
            type: 'schema',
            message: `settings route "${validated.file.route}" should declare devOnly: true on routes[]`,
            location: 'plugin.yaml routes',
            code: 'settings-route-dev-only',
            suggestion:
                'Add devOnly: true when the settings page is dev-server tooling (see Design Log #171)',
        });
    }
}

/** Validate AIditor settings template shipped with a plugin package. */
export async function validateAiditorSettings(
    context: PluginContext,
    result: ValidationResult,
): Promise<void> {
    const templatePath = path.join(context.pluginPath, AIDITOR_SETTINGS_TEMPLATE_REL_PATH);
    if (!fs.existsSync(templatePath)) {
        return;
    }

    validateSettingsTemplateAtPath(
        templatePath,
        AIDITOR_SETTINGS_TEMPLATE_REL_PATH,
        result,
        context.manifest,
    );

    if (!context.manifest.agentkit) {
        result.warnings.push({
            type: 'schema',
            message:
                'Plugin ships agent-kit/aiditor/settings.template.yaml but has no agentkit handler',
            location: 'plugin.yaml',
            code: 'settings-missing-agentkit-handler',
            suggestion:
                'Declare agentkit in plugin.yaml and materialize to agent-kit/aiditor/settings/<plugin>.yaml on jay-stack agent-kit — see agent-kit/plugin/aiditor-settings-guide.md',
        });
    }
}
