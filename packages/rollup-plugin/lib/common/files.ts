import path from 'node:path';
import { PluginContext } from 'rollup';
import { JAY_DTS_EXTENSION, JAY_EXTENSION } from '../../../compiler/lib/core/constants';
import { mkdir, readFile } from 'node:fs/promises';
import { writeFile } from 'fs/promises';
import { JayPluginContext } from '../runtime/jay-plugin-context';

export function getFileContext(
    filename: string,
    extension = JAY_EXTENSION,
): { filename: string; dirname: string } {
    return {
        filename: path.basename(filename).replace(extension, ''),
        dirname: path.dirname(filename),
    };
}

export async function readFileAsString(filePath: string): Promise<string> {
    return (await readFile(filePath)).toString();
}

export async function writeDefinitionFile(
    dirname: string,
    filename: string,
    source: string,
): Promise<string> {
    const name = path.resolve(dirname, `${filename}${JAY_DTS_EXTENSION}`);
    await writeFile(name, source, { encoding: 'utf8', flag: 'w' });
    return name;
}

export async function writeGeneratedFile(
    jayContext: JayPluginContext,
    context: PluginContext,
    id: string,
    code: string,
): Promise<string> {
    if (!jayContext.outputDir) return;
    const relativePath = path.dirname(path.relative(jayContext.projectRoot, id));
    const filePath = path.resolve(jayContext.outputDir, relativePath, path.basename(id));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, code, { encoding: 'utf8', flag: 'w' });
    console.info(['[transform] written', filePath].join(' '));
    return filePath;
}
