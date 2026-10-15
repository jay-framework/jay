import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { JayHtmlValidatorFn } from '@jay-framework/compiler-shared';

const HANDLER_EXTENSIONS = ['', '.ts', '.js', '.mjs'];

/**
 * Load a validator handler the same way stack-cli does (DL#179):
 * - npm package: `./tools` export, named export matching plugin.yaml `handler`
 * - local plugin: relative handler path, `validate` or default export
 */
export async function loadPluginValidatorHandler(
    pluginPath: string,
    packageName: string | undefined,
    handlerRef: string,
    isLocal: boolean,
): Promise<JayHtmlValidatorFn | undefined> {
    if (isLocal) {
        const handlerPath = path.resolve(pluginPath, handlerRef);
        for (const extension of HANDLER_EXTENSIONS) {
            const candidate = handlerPath + extension;
            if (!fs.existsSync(candidate)) continue;
            const handlerModule = await import(pathToFileURL(candidate).href);
            const fn = handlerModule.validate ?? handlerModule.default;
            return typeof fn === 'function' ? fn : undefined;
        }
        return undefined;
    }

    const toolsPath = path.join(pluginPath, 'dist', 'tools.js');
    let handlerModule: Record<string, unknown>;
    if (fs.existsSync(toolsPath)) {
        handlerModule = await import(pathToFileURL(toolsPath).href);
    } else if (packageName) {
        handlerModule = await import(`${packageName}/tools`);
    } else {
        return undefined;
    }

    const fn = handlerModule[handlerRef];
    return typeof fn === 'function' ? (fn as JayHtmlValidatorFn) : undefined;
}
