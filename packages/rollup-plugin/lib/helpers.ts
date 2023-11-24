import path from 'node:path';
import fs from 'node:fs';
import { InputOptions } from 'rollup';

export function isJayFile(filename: string): boolean {
    return filename.endsWith('.jay.html') && !filename.startsWith('.jay.html');
}

export function getFileContext(filename: string): { filename: string; dirname: string } {
    return {
        filename: path.basename(filename).replace('.jay.html', ''),
        dirname: path.dirname(filename),
    };
}

export function checkValidationErrors(validations: string[]): void {
    if (validations.length > 0) {
        throw new Error(validations.join('\n'));
    }
}

export function checkCodeErrors(code: string): void {
    if (code.length === 0) throw new Error('Empty code');
}

export function writeDefinitionFile(dirname: string, filename: string, source: string): void {
    const name = path.join(dirname, `${filename}.jay.html.d.ts`);
    fs.writeFileSync(name, source, { encoding: 'utf8', flag: 'w' });
}

export function getInputFiles(options: InputOptions): Set<string> {
    const dirname = process.cwd();
    return new Set(Object.values(options.input).map((file) => path.resolve(dirname, file)));
}
