import { globSync } from 'fast-glob';
import path from 'node:path';
import { JAY_EXTENSION } from './constants';

export function getJayHtmlFileInputs(source: string): { [file: string]: string } {
    return Object.fromEntries(
        globSync(`${source}/**/*${JAY_EXTENSION}`).map((file) => [
            path.relative(source, file.slice(0, file.length - JAY_EXTENSION.length)),
            file,
        ]),
    );
}
