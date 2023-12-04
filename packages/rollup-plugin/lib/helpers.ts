import path from 'node:path';
import fs from 'node:fs';
import { PluginContext } from 'rollup';

export function isJayFile(filename: string): boolean {
    return filename.endsWith('.jay-html') && !filename.startsWith('.jay-html');
}

export function getFileContext(filename: string): { filename: string; dirname: string } {
    return {
        filename: path.basename(filename).replace('.jay-html', ''),
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
    const name = path.join(dirname, `${filename}.jay-html.d.ts`);
    fs.writeFileSync(name, source, { encoding: 'utf8', flag: 'w' });
}

export function writeGeneratedFile(
    context: PluginContext,
    projectRoot: string,
    outputDir: string,
    id: string,
    code: string,
): void {
    if (!outputDir) return;
    const relativePath = path.dirname(path.relative(projectRoot, id));
    const filename = `${path.basename(id)}.ts`;
    const filePath = path.resolve(outputDir, relativePath, filename);
    context.info(['Writing generated file', filePath].join(' '));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, code, {
        encoding: 'utf8',
        flag: 'w',
    });
}
