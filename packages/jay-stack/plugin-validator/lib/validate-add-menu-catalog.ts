import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

import {
    ADD_MENU_VALIDATION_SUGGESTIONS,
    lintAddMenuCatalog,
    validateAddMenuCatalogFile,
    type AddMenuCatalogLintWarning,
    type AddMenuValidationError,
} from './add-menu-catalog-lint';
import type { ValidationResult, PluginContext } from './types';

/** Relative paths where plugins may ship Add Menu catalog yaml. */
export const ADD_MENU_CATALOG_REL_PATHS = [
    'agent-kit/aiditor/add-menu.template.yaml',
    'agent-kit/aiditor/add-menu.yaml',
] as const;

const CONTRIBUTOR_GUIDE = 'agent-kit/plugin/aiditor-add-menu.md';

function suggestionForCode(code: string | undefined): string | undefined {
    if (!code) return `See ${CONTRIBUTOR_GUIDE} for schema and validation rules`;
    return (
        ADD_MENU_VALIDATION_SUGGESTIONS[code] ??
        `See ${CONTRIBUTOR_GUIDE} for schema and validation rules`
    );
}

function mapSchemaError(error: AddMenuValidationError, catalogPath: string) {
    const code = error.code ?? 'catalog-validation-error';
    return {
        type: 'add-menu-catalog' as const,
        code,
        message: `[${code}] ${error.message}`,
        location: error.path || catalogPath,
        suggestion: suggestionForCode(code),
    };
}

function mapLintFinding(
    finding: AddMenuCatalogLintWarning,
    catalogPath: string,
    severity: 'error' | 'warning',
): {
    type: 'add-menu-catalog';
    code: string;
    message: string;
    location: string;
    itemId?: string;
    suggestion?: string;
} {
    return {
        type: 'add-menu-catalog',
        code: finding.code,
        message: `[${finding.code}] ${finding.message}`,
        location: finding.sourcePath ?? catalogPath,
        itemId: finding.itemId,
        suggestion: suggestionForCode(finding.code),
        ...(severity === 'warning' ? {} : {}),
    };
}

function pluginShipsAddMenuCatalog(context: PluginContext): boolean {
    return ADD_MENU_CATALOG_REL_PATHS.some((relPath) =>
        fs.existsSync(path.join(context.pluginPath, relPath)),
    );
}

function validateAddMenuAgentKitHandler(context: PluginContext, result: ValidationResult): void {
    if (!pluginShipsAddMenuCatalog(context)) return;

    const agentKitHandler = context.manifest.agentkit;
    if (agentKitHandler) return;

    result.warnings.push({
        type: 'add-menu-catalog',
        code: 'add-menu-missing-agentkit-handler',
        message:
            '[add-menu-missing-agentkit-handler] Plugin ships add-menu catalog yaml but plugin.yaml has no agentkit handler — catalogs must be generated during jay-stack agent-kit, not setup',
        location: 'plugin.yaml',
        suggestion: suggestionForCode('add-menu-missing-agentkit-handler'),
    });
}

async function validateAddMenuCatalogFileAtPath(
    catalogPath: string,
    relPath: string,
    result: ValidationResult,
): Promise<void> {
    let parsed: unknown;
    try {
        const content = await fs.promises.readFile(catalogPath, 'utf-8');
        parsed = YAML.parse(content);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push({
            type: 'add-menu-catalog',
            code: 'catalog-yaml-parse-error',
            message: `Invalid add-menu catalog YAML: ${message}`,
            location: relPath,
            suggestion: `Check YAML syntax in the add-menu catalog file. See ${CONTRIBUTOR_GUIDE}`,
        });
        return;
    }

    const validated = validateAddMenuCatalogFile(parsed, relPath);
    result.errors.push(...validated.errors.map((error) => mapSchemaError(error, relPath)));

    if (!validated.file?.items.length) {
        return;
    }

    const linted = lintAddMenuCatalog(validated.file.items, relPath);
    result.errors.push(
        ...linted.errors.map((finding) => mapLintFinding(finding, relPath, 'error')),
    );
    result.warnings.push(
        ...linted.warnings.map((finding) => mapLintFinding(finding, relPath, 'warning')),
    );
}

/** Lint Add Menu catalog yaml when a plugin ships a catalog template. */
export async function validateAddMenuCatalog(
    context: PluginContext,
    result: ValidationResult,
): Promise<void> {
    validateAddMenuAgentKitHandler(context, result);

    for (const relPath of ADD_MENU_CATALOG_REL_PATHS) {
        const catalogPath = path.join(context.pluginPath, relPath);
        if (!fs.existsSync(catalogPath)) continue;
        await validateAddMenuCatalogFileAtPath(catalogPath, relPath, result);
    }
}
