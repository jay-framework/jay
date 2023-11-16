import * as ts from 'typescript';
import { readTestFile } from './test-fs-utils';

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
