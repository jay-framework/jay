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

/** Patterns that indicate add-menu catalog materialization (belongs in agent-kit handler). */
const ADD_MENU_WRITE_MARKERS = [
    'agent-kit/aiditor/add-menu',
    'aiditor-add-menu-thumbnails',
    'writeAddMenuCatalog',
    'copyAiditorAddMenuThumbnails',
] as const;

function isRelativeHandlerRef(value: string): boolean {
    return value.startsWith('./') || value.startsWith('../');
}

function resolveModulePath(basePath: string): string | undefined {
    for (const ext of ['', '.ts', '.js', '/index.ts', '/index.js']) {
        const candidate = basePath + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
        }
    }
    return undefined;
}

function collectTypeScriptFiles(dir: string, depth = 0): string[] {
    if (depth > 4) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'test') {
            files.push(...collectTypeScriptFiles(fullPath, depth + 1));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
            files.push(fullPath);
        }
    }
    return files;
}

function resolveHandlerSourceFile(
    pluginPath: string,
    handlerRef: string,
    isNpmPackage: boolean,
): string | null {
    if (isRelativeHandlerRef(handlerRef)) {
        return resolveModulePath(path.join(pluginPath, handlerRef)) ?? null;
    }

    const searchRoots = isNpmPackage
        ? [path.join(pluginPath, 'lib'), path.join(pluginPath, 'dist')]
        : [pluginPath];

    for (const root of searchRoots) {
        if (!fs.existsSync(root)) continue;

        for (const file of collectTypeScriptFiles(root)) {
            const content = fs.readFileSync(file, 'utf-8');
            const definesHandler = new RegExp(
                `export\\s+(?:async\\s+)?function\\s+${handlerRef}\\b`,
            ).test(content);
            const definesDefaultNamed = new RegExp(
                `export\\s+default\\s+async\\s+function\\s+${handlerRef}\\b`,
            ).test(content);

            if (definesHandler || definesDefaultNamed) {
                return file;
            }

            const reExportMatch = content.match(
                new RegExp(
                    `export\\s*\\{[^}]*\\b${handlerRef}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`,
                ),
            );
            if (reExportMatch) {
                const importSpec = reExportMatch[1].replace(/\.js$/, '');
                const resolved = resolveModulePath(path.resolve(path.dirname(file), importSpec));
                if (resolved) return resolved;
            }
        }
    }

    return null;
}

function extractBalancedBlock(source: string, openBraceIndex: number): string | null {
    let depth = 0;
    for (let index = openBraceIndex; index < source.length; index++) {
        const char = source[index];
        if (char === '{') depth++;
        else if (char === '}') {
            depth--;
            if (depth === 0) {
                return source.slice(openBraceIndex, index + 1);
            }
        }
    }
    return null;
}

function findFunctionBodyOpenBrace(source: string, searchFrom: number): number {
    const arrowMatch = /=>\s*\{/.exec(source.slice(searchFrom));
    const parenMatch = /\)\s*(?::[^{]+)?\{/.exec(source.slice(searchFrom));
    const candidates: number[] = [];
    if (arrowMatch?.index !== undefined) {
        candidates.push(searchFrom + arrowMatch.index + arrowMatch[0].length - 1);
    }
    if (parenMatch?.index !== undefined) {
        candidates.push(searchFrom + parenMatch.index + parenMatch[0].length - 1);
    }
    if (candidates.length === 0) return -1;
    return Math.min(...candidates);
}

function extractFunctionBody(source: string, functionName: string): string | null {
    const patterns = [
        new RegExp(`export\\s+async\\s+function\\s+${functionName}\\b`),
        new RegExp(`export\\s+function\\s+${functionName}\\b`),
        new RegExp(`export\\s+default\\s+async\\s+function\\s+${functionName}\\b`),
        new RegExp(
            `export\\s+const\\s+${functionName}\\s*=\\s*async\\s*\\([^)]*\\)\\s*(?::[^{]+)?=>\\s*\\{`,
        ),
        new RegExp(
            `export\\s+const\\s+${functionName}\\s*=\\s*\\([^)]*\\)\\s*(?::[^{]+)?=>\\s*\\{`,
        ),
    ];

    for (const pattern of patterns) {
        const match = pattern.exec(source);
        if (!match) continue;
        const braceIndex = findFunctionBodyOpenBrace(source, match.index);
        if (braceIndex === -1) continue;
        return extractBalancedBlock(source, braceIndex);
    }

    return null;
}

function extractDefaultExportFunctionBody(source: string): string | null {
    const patterns = [
        /export\s+default\s+async\s+function\s+\w+\b/,
        /export\s+default\s+async\s+function\s*\(/,
        /export\s+default\s+async\s*\([^)]*\)\s*(?::[^{]+)?=>\s*\{/,
    ];

    for (const pattern of patterns) {
        const match = pattern.exec(source);
        if (!match) continue;
        const braceIndex = findFunctionBodyOpenBrace(source, match.index);
        if (braceIndex === -1) continue;
        return extractBalancedBlock(source, braceIndex);
    }

    return null;
}

function handlerBodyWritesAddMenuCatalog(body: string): boolean {
    return ADD_MENU_WRITE_MARKERS.some((marker) => body.includes(marker));
}

function resolveSetupHandlerFunctionBody(
    pluginPath: string,
    handlerRef: string,
    isNpmPackage: boolean,
): string | null {
    const sourceFile = resolveHandlerSourceFile(pluginPath, handlerRef, isNpmPackage);
    if (!sourceFile) return null;

    const source = fs.readFileSync(sourceFile, 'utf-8');
    if (isRelativeHandlerRef(handlerRef)) {
        return (
            extractDefaultExportFunctionBody(source) ??
            extractFunctionBody(source, 'setup') ??
            extractFunctionBody(source, handlerRef)
        );
    }

    return extractFunctionBody(source, handlerRef);
}

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
    if (!agentKitHandler) {
        result.warnings.push({
            type: 'add-menu-catalog',
            code: 'add-menu-missing-agentkit-handler',
            message:
                '[add-menu-missing-agentkit-handler] Plugin ships add-menu catalog yaml but plugin.yaml has no agentkit handler — catalogs must be generated during jay-stack agent-kit (yarn agent-kit), not jay-stack setup',
            location: 'plugin.yaml',
            suggestion: suggestionForCode('add-menu-missing-agentkit-handler'),
        });
    }

    const setupHandler =
        typeof context.manifest.setup === 'string' ? context.manifest.setup : undefined;
    if (!setupHandler) return;

    const setupBody = resolveSetupHandlerFunctionBody(
        context.pluginPath,
        setupHandler,
        context.isNpmPackage,
    );
    if (!setupBody || !handlerBodyWritesAddMenuCatalog(setupBody)) return;

    result.warnings.push({
        type: 'add-menu-catalog',
        code: 'add-menu-legacy-setup-handler',
        message:
            '[add-menu-legacy-setup-handler] setup handler writes add-menu catalogs — move catalog materialization to agentkit and run jay-stack agent-kit (yarn agent-kit); keep setup for config and credentials only',
        location: `plugin.yaml setup (${setupHandler})`,
        suggestion: suggestionForCode('add-menu-legacy-setup-handler'),
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
