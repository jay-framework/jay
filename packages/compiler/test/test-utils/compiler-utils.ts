import path from 'node:path';
import {
    generateElementBridgeFile,
    generateElementFile,
    parseJayFile,
    WithValidations,
} from '../../lib';
import { JayFile } from '../../lib/core/jay-file-types';
import { getFileFromFolder, readNamedSourceJayFile, readTestFile } from './file-utils';

export async function readAndParseJayFile(
    folder: string,
    givenFile?: string,
): Promise<WithValidations<JayFile>> {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile || getFileFromFolder(folder);
    const filename = `${file}.jay.html`;
    const code = await readTestFile(folder, filename);
    return parseJayFile(code, filename, dirname);
}

export async function readFileAndGenerateElementBridgeFile(folder: string) {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = getFileFromFolder(folder);
    const jayFile = await readNamedSourceJayFile(folder, file);
    return generateElementBridgeFile(jayFile, `${file}.jay.html`, dirname);
}
export async function readFileAndGenerateElementFile(folder: string, givenFile?: string) {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile || getFileFromFolder(folder);
    const jayFile = await readNamedSourceJayFile(folder, file);
    return generateElementFile(jayFile, `${file}.jay.html`, dirname);
}
