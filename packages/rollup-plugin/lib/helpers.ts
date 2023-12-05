import path from 'node:path';
import fs from 'node:fs';
import { PluginContext } from 'rollup';
import { RuntimeMode, JAY_EXTENSION, JAY_TS_EXTENSION, JAY_DTS_EXTENSION } from './constants';
import { mkdir, readFile } from 'node:fs/promises';
import { writeFile } from 'fs/promises';

export function isJayFile(filename: string): boolean {
    return filename.endsWith(JAY_EXTENSION) && !filename.startsWith(JAY_EXTENSION);
}

export function isJayTsFile(filename: string): boolean {
    return filename.endsWith(JAY_TS_EXTENSION) && !filename.startsWith(JAY_TS_EXTENSION);
}

export function getFileContext(
    filename: string,
    extension = JAY_EXTENSION,
): { filename: string; dirname: string } {
    return {
        filename: path.basename(filename).replace(extension, ''),
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

export async function readFileWhenExists(
    dirname: string,
    filename: string,
): Promise<string | undefined> {
    try {
        return (await readFile(path.resolve(dirname, filename))).toString();
    } catch (error) {
        if (error.code === 'ENOENT') {
            return undefined;
        } else {
            throw error;
        }
    }
}

export function writeDefinitionFile(dirname: string, filename: string, source: string): string {
    const name = path.join(dirname, `${filename}${JAY_DTS_EXTENSION}`);
    fs.writeFileSync(name, source, { encoding: 'utf8', flag: 'w' });
    return name;
}

export async function writeGeneratedFile(
    context: PluginContext,
    projectRoot: string,
    outputDir: string,
    id: string,
    code: string,
): Promise<void> {
    if (!outputDir) return;
    const relativePath = path.dirname(path.relative(projectRoot, id));
    const filePath = path.resolve(outputDir, relativePath, path.basename(id));
    context.info(['Writing generated file', filePath].join(' '));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, code, { encoding: 'utf8', flag: 'w' });
}
