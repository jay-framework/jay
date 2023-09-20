import * as ts from "typescript";
import {readTestFile} from "./test-fs-utils";

const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed
});

export async function readTsSourceFile(filePath: string, fileName: string) {
    const code = await readTestFile(filePath, fileName)
    return ts.createSourceFile(fileName, code,
        ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
}

export async function printTsFile(outputFile: ts.TransformationResult<ts.SourceFile>): Promise<string> {
    let printedFile = await printer.printNode(ts.EmitHint.Unspecified, outputFile.transformed[0],
        ts.createSourceFile('generated-component-bridge.ts', "", ts.ScriptTarget.Latest));
    return formatTypescript(printedFile);
}

export async function readExpectedTsFile(folder: string, filename: string) {
    return stripEmptyLines(formatTypescript(await readTestFile(folder, filename)));
}

function stripEmptyLines(code: string): string {
    return code.split('\n').filter(_ => _.length > 0).join('\n');
}

const formatOptions = {
    baseIndentSize: 0,
    indentSize: 2,
    tabSize: 2,
    indentStyle: ts.IndentStyle.Smart,
    newLineCharacter: "\n",
    convertTabsToSpaces: true,
    insertSpaceAfterCommaDelimiter: true,
    insertSpaceAfterSemicolonInForStatements: true,
    insertSpaceBeforeAndAfterBinaryOperators: true,
    insertSpaceAfterConstructor: false,
    insertSpaceAfterKeywordsInControlFlowStatements: true,
    insertSpaceAfterFunctionKeywordForAnonymousFunctions: false,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
    insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: false,
    insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
    insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
    insertSpaceAfterTypeAssertion: false,
    insertSpaceBeforeFunctionParenthesis: false,
    placeOpenBraceOnNewLineForFunctions: false,
    placeOpenBraceOnNewLineForControlBlocks: false,
    insertSpaceBeforeTypeAnnotation: false,
}

export function formatTypescript(code: string) {
    const host: ts.LanguageServiceHost = {
        fileExists(fileName: string): boolean {
            return true;
        }, getCompilationSettings(): ts.CompilerOptions {
            return ts.getDefaultCompilerOptions();
        }, getCurrentDirectory(): string {
            return ".";
        }, getDefaultLibFileName(options: ts.CompilerOptions): string {
            return ts.getDefaultLibFilePath(options);
        }, getScriptFileNames(): string[] {
            return ['source.ts'];
        }, getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
            return ts.ScriptSnapshot.fromString(code);
        },
        getScriptVersion: (fileName: string): string => "",
        readFile(fileName: string, encoding?: string): string | undefined {
            return undefined;
        }
    }
    const languageService = ts.createLanguageService(host);
    const edits = languageService.getFormattingEditsForDocument('source.ts', formatOptions);
    edits
        .sort((a, b) => a.span.start - b.span.start)
        .reverse()
        .forEach(edit => {
            const head = code.slice(0, edit.span.start);
            const tail = code.slice(edit.span.start + edit.span.length);
            code = `${head}${edit.newText}${tail}`;
        });

    return code.trim();

}