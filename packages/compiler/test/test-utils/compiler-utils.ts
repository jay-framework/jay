import path from 'node:path';
import * as ts from 'typescript';
import {
    componentBridgeTransformer,
    generateElementBridgeFile,
    generateElementFile,
    generateImportsFileFromJayFile,
    parseJayFile,
    prettify,
    RuntimeMode,
    WithValidations,
} from '../../lib';
import { JayFile } from '../../lib/core/jay-file-types';
import {
    getFileFromFolder,
    printTsFile,
    readNamedSourceJayFile,
    readTestFile,
    readTsSourceFile,
} from './file-utils';
import { generateImportsFileFromTsSource } from '../../lib/ts-file/generate-imports-file';
import { componentSandboxTransformer } from '../../lib/ts-file/component-sandbox-transformer';

export async function readAndParseJayFile(
    folder: string,
    givenFile?: string,
): Promise<WithValidations<JayFile>> {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile || getFileFromFolder(folder);
    const filename = `${file}.jay-html`;
    const code = await readTestFile(folder, filename);
    return parseJayFile(code, filename, dirname);
}

export async function readFileAndGenerateElementBridgeFile(folder: string, givenFile?: string) {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile || getFileFromFolder(folder);
    const jayFile = await readNamedSourceJayFile(folder, file);
    const parsedFile = parseJayFile(jayFile, `${file}.jay-html`, dirname);
    return generateElementBridgeFile(parsedFile);
}

export async function readFileAndGenerateElementFile(folder: string, givenFile?: string) {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile || getFileFromFolder(folder);
    const jayFile = await readNamedSourceJayFile(folder, file);
    const parsedFile = parseJayFile(jayFile, `${file}.jay-html`, dirname);
    return generateElementFile(parsedFile, RuntimeMode.SandboxMain);
}

export async function readFileAndGenerateComponentBridgeFile(folder: string, givenFile?: string) {
    const file = givenFile ?? `${getFileFromFolder(folder)}.ts`;
    const sourceFile = await readTsSourceFile(folder, file);
    const outputFile = ts.transform(sourceFile, [
        componentBridgeTransformer(RuntimeMode.SandboxMain),
    ]);
    return await prettify(await printTsFile(outputFile));
}

export async function readFileAndGenerateComponentSandboxFile(folder: string, givenFile?: string) {
    const file = givenFile ?? `${getFileFromFolder(folder)}.ts`;
    const sourceFile = await readTsSourceFile(folder, file);
    const outputFile = ts.transform(sourceFile, [componentSandboxTransformer()]);
    return await prettify(await printTsFile(outputFile));
}

export async function readFileAndGenerateImportsFileFromTsFile(
    folder: string,
    givenFile?: string,
): Promise<string> {
    const file = givenFile ?? `${getFileFromFolder(folder)}.ts`;
    const sourceFile = await readTestFile(folder, file);
    const output = generateImportsFileFromTsSource(file, sourceFile);
    return await prettify(output);
}

export async function readFileAndGenerateImportsFileFromJayFile(
    folder: string,
    givenFile?: string,
): Promise<string> {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile ?? `${getFileFromFolder(folder)}.jay-html`;
    const sourceFile = await readTestFile(folder, file);
    const parsedFile = parseJayFile(sourceFile, file, dirname);
    const output = generateImportsFileFromJayFile(parsedFile);
    return await prettify(output);
}
