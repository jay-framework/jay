import { promises } from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { removeComments } from '../../lib/utils/prettify';
import {astToCode} from "../../lib/ts-file/ts-compiler-utils.ts";

const { readFile } = promises;

export async function readTsSourceFile(filePath: string, fileName: string) {
    const code = await readTestFile(filePath, fileName);
    return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
}

export function printTsFile(
    outputFile: ts.TransformationResult<ts.SourceFile>,
): string {
    return astToCode(outputFile.transformed[0]);
}

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
    return readTestFile(folder, `${file}.ts`);
}
export async function readGeneratedElementFile(folder) {
    return readTestFile(folder, 'generated-element.ts');
}

export async function readGeneratedElementBridgeFile(folder) {
    return readTestFile(folder, 'generated-element-bridge.ts');
}

export async function readGeneratedElementDefinitionFile(
    folder: string,
    filename: string = 'generated-element.d.ts',
) {
    return readTestFile(folder, filename);
}

export function getFileFromFolder(folder: string): string {
    return folder.split('/').slice(-1)[0];
}
