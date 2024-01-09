import path from 'node:path';
import * as ts from 'typescript';
import { TransformerFactory } from 'typescript';
import {
    checkValidationErrors,
    componentBridgeTransformer,
    componentSandboxTransformer,
    generateElementBridgeFile,
    generateElementFile,
    generateImportsFileFromJayFile,
    generateImportsFileFromTsSource,
    JayFile,
    parseJayFile,
    prettify,
    RuntimeMode,
    WithValidations,
} from '../../lib';
import { getFileFromFolder, readNamedSourceJayFile, readTestFile } from './file-utils';
import { astToCode } from '../../lib/ts-file/ts-compiler-utils';

export async function readFixtureFile(
    fixturePath: string,
): Promise<{ dirname: string; filePath: string; code: string }> {
    const filePath = path.resolve(__dirname, '../fixtures', fixturePath);
    const dirname = path.dirname(filePath);
    const code = await readTestFile(path.dirname(fixturePath), path.basename(fixturePath));
    return { dirname, filePath, code };
}

export async function readAndParseJayFile(
    folder: string,
    givenFile?: string,
): Promise<WithValidations<JayFile>> {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile || getFileFromFolder(folder);
    const filename = `${file}.jay-html`;
    const code = await readTestFile(folder, filename);
    return parseJayFile(code, filename, dirname, {});
}

export async function readFileAndGenerateElementBridgeFile(folder: string, givenFile?: string) {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile || getFileFromFolder(folder);
    const jayFile = await readNamedSourceJayFile(folder, file);
    const parsedFile = checkValidationErrors(
        parseJayFile(jayFile, `${file}.jay-html`, dirname, {}),
    );
    return generateElementBridgeFile(parsedFile);
}

export async function readFileAndGenerateElementFile(folder: string, givenFile?: string) {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile || getFileFromFolder(folder);
    const jayFile = await readNamedSourceJayFile(folder, file);
    const parsedFile = checkValidationErrors(
        parseJayFile(jayFile, `${file}.jay-html`, dirname, {}),
    );
    return generateElementFile(parsedFile, RuntimeMode.MainSandbox);
}

export async function readTsSourceFile(filePath: string, fileName: string) {
    const code = await readTestFile(filePath, fileName);
    return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
}

export function printTsFile(outputFile: ts.TransformationResult<ts.SourceFile>): string {
    return astToCode(outputFile.transformed[0]);
}

export async function transformCode(
    code: string,
    transformers: TransformerFactory<ts.SourceFile>[],
) {
    const sourceFile = ts.createSourceFile(
        'dummy.ts',
        code,
        ts.ScriptTarget.Latest,
        false,
        ts.ScriptKind.TS,
    );
    const outputFile = ts.transform(sourceFile, transformers);
    return await prettify(printTsFile(outputFile));
}

export async function readFileAndTsTransform(
    folder: string,
    transformers: TransformerFactory<ts.SourceFile>[],
    givenFile?: string,
) {
    const file = givenFile ?? `${getFileFromFolder(folder)}.ts`;
    const sourceFile = await readTsSourceFile(folder, file);
    const outputFile = ts.transform(sourceFile, transformers);
    return await prettify(printTsFile(outputFile));
}

export async function readFileAndGenerateComponentBridgeFile(folder: string, givenFile?: string) {
    return readFileAndTsTransform(
        folder,
        [componentBridgeTransformer(RuntimeMode.MainSandbox)],
        givenFile,
    );
}

export async function readFileAndGenerateComponentSandboxFile(folder: string, givenFile?: string) {
    return readFileAndTsTransform(folder, [componentSandboxTransformer()], givenFile);
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
    const parsedFile = checkValidationErrors(parseJayFile(sourceFile, file, dirname, {}));
    const output = generateImportsFileFromJayFile(parsedFile);
    return await prettify(output);
}
