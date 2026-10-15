import fs from 'fs';
import path from 'path';
import { parse } from 'node-html-parser';
import { findingsMissingSuppressKey, type PluginManifest } from '@jay-framework/compiler-shared';
import type { PluginContext, ValidationResult } from './types';
import { loadPluginValidatorHandler } from './load-validator-handler.js';

function readPackageName(pluginPath: string): string | undefined {
    const packageJsonPath = path.join(pluginPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return undefined;
    try {
        const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { name?: string };
        return parsed.name;
    } catch {
        return undefined;
    }
}

function minimalValidationContext(pluginPath: string) {
    return {
        body: parse('<body><button tabindex="3">x</button></body>').querySelector('body')!,
        filePath: 'probe/page.jay-html',
        projectRoot: pluginPath,
        headlessImports: [],
        css: '.nav li > ul { display: none; } .nav li:hover > ul { display: block; }',
    };
}

function pushContractIssue(
    result: ValidationResult,
    strict: boolean,
    entry: {
        message: string;
        location?: string;
        suggestion?: string;
    },
): void {
    const payload = { type: 'validator-contract', ...entry };
    if (strict) {
        result.errors.push({ ...payload, type: 'schema' });
    } else {
        result.warnings.push(payload);
    }
}

/**
 * Smoke probe for DL#220: warnings from plugin validators should carry suppressKey.
 * Full coverage belongs in plugin unit tests (`findingsMissingSuppressKey`).
 */
export async function validateValidatorFindingContract(
    context: PluginContext,
    result: ValidationResult,
    strict: boolean,
): Promise<void> {
    const manifest = context.manifest as PluginManifest;
    if (!manifest.validators?.length) return;

    const packageName = readPackageName(context.pluginPath);
    const isLocal = !context.isNpmPackage;
    const probeContext = minimalValidationContext(context.pluginPath);

    for (const validator of manifest.validators) {
        let handler;
        try {
            handler = await loadPluginValidatorHandler(
                context.pluginPath,
                packageName,
                validator.handler,
                isLocal,
            );
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            pushContractIssue(result, strict, {
                message: `Failed to load validator "${validator.name}" handler: ${message}`,
                location: validator.handler,
                suggestion: 'Ensure dist/tools.js builds and re-exports the handler named in plugin.yaml',
            });
            continue;
        }

        if (!handler) {
            continue;
        }

        try {
            const findings = await handler(probeContext);
            const missing = findingsMissingSuppressKey(findings);
            if (missing.length > 0) {
                const sample = missing[0]?.message ?? '(no message)';
                pushContractIssue(result, strict, {
                    message:
                        `Validator "${validator.name}" emitted ${missing.length} warning(s) without suppressKey (e.g. "${sample}")`,
                    location: 'plugin.yaml validators',
                    suggestion:
                        'Every warning needs ruleId and suppressKey. Run plugin unit tests with findingsMissingSuppressKey().',
                });
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            result.warnings.push({
                type: 'validator-contract',
                message: `Validator "${validator.name}" threw during contract probe: ${message}`,
                location: validator.handler,
            });
        }
    }
}
