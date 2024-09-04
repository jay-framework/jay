import { promises } from 'node:fs';
import path from 'node:path';
import { removeComments } from '../../lib/utils/prettify';
import { prettify } from '../../lib';

const { readFile } = promises;

export async function readTestFile(folder, filename) {
    return removeComments(
        (await readFile(path.resolve(__dirname, `../fixtures/${folder}/${filename}`))).toString(),
    );
}

export async function readSourceJayFile(folder) {
    return readTestFile(folder, 'source.jay-html');
}
export async function readNamedSourceJayFile(folder, file) {
    return readTestFile(folder, `${file}.jay-html`);
}

export async function readGeneratedNamedFile(folder, file) {
    return prettify(await readTestFile(folder, `${file}.ts`));
}
export async function readGeneratedElementFile(folder) {
    return prettify(await readTestFile(folder, 'generated-element.ts'));
}

export async function readGeneratedElementBridgeFile(folder) {
    return prettify(await readTestFile(folder, 'generated-element-bridge.ts'));
}

export async function readGeneratedElementDefinitionFile(
    folder: string,
    filename: string = 'generated-element.d.ts',
) {
    return prettify(await readTestFile(folder, filename));
}

export function getFileFromFolder(folder: string): string {
    return folder.split('/').slice(-1)[0];
}
