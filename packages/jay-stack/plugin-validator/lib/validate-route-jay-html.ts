import fs from 'fs';
import path from 'path';

import { JAY_EXTENSION, RuntimeMode } from '@jay-framework/compiler-shared';
import {
    generateElementFile,
    generateServerElementFile,
    JAY_IMPORT_RESOLVER,
    parseJayFile,
} from '@jay-framework/compiler-jay-html';

/**
 * Tier-1-style compile check for a single plugin route `.jay-html` (parse + client + SSR generate).
 * Mirrors the generate stage of `jay-stack validate` (DL#73) without project-level rules.
 */
export async function compileValidateRouteJayHtml(
    absoluteJayHtmlPath: string,
    pluginRoot: string,
): Promise<string[]> {
    const content = fs.readFileSync(absoluteJayHtmlPath, 'utf-8');
    const dirname = path.dirname(absoluteJayHtmlPath);
    const filename = path.basename(absoluteJayHtmlPath, JAY_EXTENSION);

    const errors: string[] = [];

    try {
        const parsedFile = await parseJayFile(
            content,
            filename,
            dirname,
            {},
            JAY_IMPORT_RESOLVER,
            pluginRoot,
        );

        for (const validation of parsedFile.validations) {
            errors.push(validation);
        }
        if (!parsedFile.val || parsedFile.validations.length > 0) {
            return errors;
        }

        const generatedFile = generateElementFile(parsedFile.val, RuntimeMode.MainTrusted);
        for (const validation of generatedFile.validations) {
            errors.push(validation);
        }

        const serverElementFile = generateServerElementFile(parsedFile.val);
        for (const validation of serverElementFile.validations) {
            errors.push(`[SSR] ${validation}`);
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
    }

    return errors;
}
