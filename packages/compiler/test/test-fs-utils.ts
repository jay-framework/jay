import { promises } from 'node:fs';
import path from 'node:path';

const readFile = promises.readFile;
export const readTestFile = async (folder, filename) =>
    (await readFile(path.resolve(__dirname, `./fixtures/${folder}/${filename}`))).toString();
export const readSourceJayFile = async (folder) => readTestFile(folder, 'source.jay.html');
export const readNamedSourceJayFile = async (folder, file) =>
    readTestFile(folder, `${file}.jay.html`);
export const readGeneratedNamedFile = async (folder, file) => readTestFile(folder, `${file}.ts`);
export const readGeneratedElementFile = async (folder) =>
    readTestFile(folder, 'generated-element.ts');
export const readGeneratedElementBridgeFile = async (folder) =>
    readTestFile(folder, 'generated-element-bridge.ts');
export const readGeneratedElementDefinitionFile = async (folder) =>
    readTestFile(folder, 'generated-element.d.ts');
