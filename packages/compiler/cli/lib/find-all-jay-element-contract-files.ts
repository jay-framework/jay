import { globSync } from 'fast-glob';
import path from 'node:path';
import { JAY_CONTRACT_EXTENSION, JAY_EXTENSION } from '@jay-framework/compiler-shared';

export function getJayHtmlOrContractFileInputs(source: string): { [file: string]: string } {
    return Object.fromEntries(
        globSync(`${source}/**/*{${JAY_EXTENSION},${JAY_CONTRACT_EXTENSION}}`).map((file) => {
            const moduleName = file.includes(JAY_EXTENSION)
                ? file.slice(0, file.length - JAY_EXTENSION.length)
                : file.slice(0, file.length - JAY_CONTRACT_EXTENSION.length);
            return [path.relative(source, moduleName), file];
        }),
    );
}
