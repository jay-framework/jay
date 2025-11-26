import { glob } from 'glob';
import path from 'node:path';
import { JAY_CONTRACT_EXTENSION, JAY_EXTENSION } from '@jay-framework/compiler-shared';

export function getJayHtmlOrContractFileInputs(source: string): { [file: string]: string } {
    return Object.fromEntries(
        glob.sync(`${source}/**/*{${JAY_EXTENSION},${JAY_CONTRACT_EXTENSION}}`).map((file) => {
            // Use relative path without extension as key, but preserve distinction between
            // .jay-html and .jay-contract files with the same base name
            const relativePath = path.relative(source, file);
            let moduleName: string;
            if (file.endsWith(JAY_CONTRACT_EXTENSION)) {
                moduleName = relativePath.slice(0, -JAY_CONTRACT_EXTENSION.length) + '.contract';
            } else {
                moduleName = relativePath.slice(0, -JAY_EXTENSION.length);
            }
            return [moduleName, file];
        }),
    );
}
