import glob from 'glob';
import path from 'node:path';
import { JAY_EXTENSION } from './constants.ts';

export function getJayHtmlFileInputs(source: string) {
    return Object.fromEntries(
        glob
            .sync(`${source}/**/*${JAY_EXTENSION}`)
            .map((file) => [
                path.relative(source, file.slice(0, file.length - JAY_EXTENSION.length)),
                file,
            ]),
    );
}
