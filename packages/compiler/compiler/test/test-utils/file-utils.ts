import { promises } from 'node:fs';
import path from 'node:path';
import { removeComments } from '../../lib/utils/prettify';
import { prettify } from '../../lib';

const { readFile } = promises;

export function fixtureFilePath(folder, filename): string {
    return path.resolve(__dirname, `../fixtures/${folder}/${filename}`);
}
export function fixtureDir(folder): string {
    return path.resolve(__dirname, `../fixtures/${folder}`);
}

export async function readFixtureFileRaw(folder, filename): Promise<string> {
    return removeComments((await readFile(fixtureFilePath(folder, filename))).toString());
}

export async function readFixtureSourceJayFile(folder, file) {
    return readFixtureFileRaw(folder, `${file}.jay-html`);
}

export async function readFixtureFile(folder, file) {
    return prettify(await readFixtureFileRaw(folder, `${file}.ts`));
}
export async function readFixtureElementFile(folder) {
    return prettify(await readFixtureFileRaw(folder, 'generated-element.ts'));
}

export async function readFixtureReactElementFile(folder) {
    return prettify(await readFixtureFileRaw(folder, 'generated-react-element.tsx'));
}

export async function readFixtureElementBridgeFile(folder) {
    return prettify(await readFixtureFileRaw(folder, 'generated-element-bridge.ts'));
}

export async function readFixtureElementDefinitionFile(
    folder: string,
    filename: string = 'generated-element.d.ts',
) {
    return prettify(await readFixtureFileRaw(folder, filename));
}

export function getFileFromFolder(folder: string): string {
    return folder.split('/').slice(-1)[0];
}
