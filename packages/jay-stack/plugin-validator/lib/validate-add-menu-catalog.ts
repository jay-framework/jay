import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

import {
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

function mapSchemaError(error: AddMenuValidationError, catalogPath: string) {
    return {
        type: 'add-menu-catalog' as const,
        code: error.code,
        message: error.code ? `[${error.code}] ${error.message}` : error.message,
        location: error.path || catalogPath,
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
        ...(severity === 'warning' && finding.code === 'gif-missing-poster'
            ? {
                  suggestion:
                      'Add presentation.poster with a static image for prefers-reduced-motion accessibility',
              }
            : {}),
    };
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
            message: `Invalid add-menu catalog YAML: ${message}`,
            location: relPath,
            suggestion: 'Check YAML syntax in the add-menu catalog file',
        });
        return;
    }

    const validated = validateAddMenuCatalogFile(parsed, relPath);
    result.errors.push(...validated.errors.map((error) => mapSchemaError(error, relPath)));

    if (!validated.file?.items.length) {
        return;
    }

    const linted = lintAddMenuCatalog(validated.file.items, relPath);
    result.errors.push(...linted.errors.map((finding) => mapLintFinding(finding, relPath, 'error')));
    result.warnings.push(
        ...linted.warnings.map((finding) => mapLintFinding(finding, relPath, 'warning')),
    );
}

/** Lint Add Menu catalog yaml when a plugin ships a catalog template. */
export async function validateAddMenuCatalog(
    context: PluginContext,
    result: ValidationResult,
): Promise<void> {
    for (const relPath of ADD_MENU_CATALOG_REL_PATHS) {
        const catalogPath = path.join(context.pluginPath, relPath);
        if (!fs.existsSync(catalogPath)) continue;
        await validateAddMenuCatalogFileAtPath(catalogPath, relPath, result);
    }
}
