import fs from 'fs';
import path from 'path';
import { ts, type TypeScript } from '@jay-framework/typescript-bridge';
import { JAY_EXTENSION } from './constants';
import type { ComponentScript, ScriptCache } from './plugin-validators';

function createComponentScriptEntry(
    absoluteScriptPath: string,
    projectRoot: string,
    cache: ScriptCache,
): ComponentScript {
    const relativePath = path.relative(projectRoot, absoluteScriptPath).split(path.sep).join('/');

    let textCache: string | undefined;
    let sourceFileCache: TypeScript.SourceFile | undefined;

    const script: ComponentScript = {
        filePath: relativePath,
        get text(): string {
            if (textCache === undefined) {
                textCache = fs.readFileSync(absoluteScriptPath, 'utf-8');
            }
            return textCache;
        },
        get sourceFile(): TypeScript.SourceFile {
            if (sourceFileCache === undefined) {
                const content = script.text;
                sourceFileCache = ts.createSourceFile(
                    absoluteScriptPath,
                    content,
                    ts.ScriptTarget.Latest,
                    true,
                );
            }
            return sourceFileCache;
        },
    };

    cache.set(absoluteScriptPath, script);
    return script;
}

/**
 * Resolves the component script for a jay-html template: `<basename>.ts`, then `page.ts`.
 * Returns a cached entry per absolute script path for the validate run.
 */
export function resolveComponentScript(
    jayHtmlPath: string,
    projectRoot: string,
    cache: ScriptCache,
): ComponentScript | undefined {
    const root = path.resolve(projectRoot);
    const absoluteJay = path.isAbsolute(jayHtmlPath)
        ? jayHtmlPath
        : path.resolve(root, jayHtmlPath);
    const dirname = path.dirname(absoluteJay);
    const basename = path.basename(absoluteJay, JAY_EXTENSION);
    const candidates = [path.join(dirname, `${basename}.ts`), path.join(dirname, 'page.ts')];
    const scriptPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!scriptPath) {
        return undefined;
    }

    const cached = cache.get(scriptPath);
    if (cached) {
        return cached;
    }

    return createComponentScriptEntry(scriptPath, root, cache);
}
