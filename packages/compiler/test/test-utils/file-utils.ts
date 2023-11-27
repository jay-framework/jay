import { promises } from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';

const { readFile } = promises;

const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
});

export async function readTsSourceFile(filePath: string, fileName: string) {
    const code = await readTestFile(filePath, fileName);
    return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
}

export async function printTsFile(
    outputFile: ts.TransformationResult<ts.SourceFile>,
): Promise<string> {
    const printedFile = await printer.printNode(
        ts.EmitHint.Unspecified,
        outputFile.transformed[0],
        ts.createSourceFile('generated-component-bridge.ts', '', ts.ScriptTarget.Latest),
    );
    return printedFile;
}

export async function readTestFile(folder, filename) {
    return (
        await readFile(path.resolve(__dirname, `../fixtures/${folder}/${filename}`))
    ).toString();
}

export async function readSourceJayFile(folder) {
    return readTestFile(folder, 'source.jay.html');
}
export async function readNamedSourceJayFile(folder, file) {
    return readTestFile(folder, `${file}.jay.html`);
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

export async function readGeneratedElementDefinitionFile(folder) {
    return readTestFile(folder, 'generated-element.d.ts');
}

export function getFileFromFolder(folder: string): string {
    return folder.split('/').slice(-1)[0];
}
