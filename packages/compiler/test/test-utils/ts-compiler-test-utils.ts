import path from 'node:path';
import * as ts from 'typescript';
import { isStatement, Statement, TransformerFactory } from 'typescript';
import {
    checkValidationErrors,
    transformComponentBridge,
    generateElementBridgeFile,
    generateElementFile,
    generateImportsFileFromJayFile,
    generateImportsFileFromTsSource,
    MainRuntimeModes,
    parseJayFile,
    prettify,
    RuntimeMode,
    WithValidations,
    FunctionRepositoryBuilder,
} from '../../lib';
import {
    getFileFromFolder,
    readFixtureSourceJayFile,
    readFixtureFile,
    fixtureDir,
} from './file-utils';
import { astToCode } from '../../lib/ts-file/ts-utils/ts-compiler-utils';
import { JayHtmlFile } from '../../lib';

export async function readAndParseJayFile(
    folder: string,
    givenFile?: string,
): Promise<WithValidations<JayHtmlFile>> {
    const file = givenFile || getFileFromFolder(folder);
    const dirname = fixtureDir(folder);
    const filename = `${file}.jay-html`;
    const code = await readFixtureSourceJayFile(folder, file);
    return parseJayFile(code, filename, dirname, {});
}

export async function readFileAndGenerateElementBridgeFile(folder: string, givenFile?: string) {
    const dirname = fixtureDir(folder);
    const file = givenFile || getFileFromFolder(folder);
    const jayFile = await readFixtureSourceJayFile(folder, file);
    const parsedFile = checkValidationErrors(
        parseJayFile(jayFile, `${file}.jay-html`, dirname, {}),
    );
    return generateElementBridgeFile(parsedFile);
}

export async function readFileAndGenerateElementFile(
    folder: string,
    importerMode: MainRuntimeModes = RuntimeMode.MainTrusted,
    givenFile?: string,
) {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile || getFileFromFolder(folder);
    const jayFile = await readFixtureSourceJayFile(folder, file);
    const parsedFile = checkValidationErrors(
        parseJayFile(jayFile, `${file}.jay-html`, dirname, {}),
    );
    return generateElementFile(parsedFile, importerMode);
}

export async function readTsSourceFile(filePath: string, fileName: string) {
    const code = await readFixtureFile(filePath, fileName);
    return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
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
        true,
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
    const file = givenFile ?? `${getFileFromFolder(folder)}`;
    const sourceFile = await readTsSourceFile(folder, file);
    const outputFile = ts.transform(sourceFile, transformers);
    return await prettify(printTsFile(outputFile));
}

export async function readFileAndGenerateComponentBridgeFile(folder: string, givenFile?: string) {
    return readFileAndTsTransform(
        folder,
        [transformComponentBridge(RuntimeMode.MainSandbox, [], new FunctionRepositoryBuilder())],
        givenFile,
    );
}

export async function readFileAndGenerateImportsFileFromTsFile(
    folder: string,
    givenFile?: string,
): Promise<string> {
    const file = givenFile ?? `${getFileFromFolder(folder)}`;
    const sourceFile = await readFixtureFile(folder, file);
    const output = generateImportsFileFromTsSource(file, sourceFile);
    return await prettify(output);
}

export async function readFileAndGenerateImportsFileFromJayFile(
    folder: string,
    givenFile?: string,
): Promise<string> {
    const dirname = path.resolve(__dirname, '../fixtures', folder);
    const file = givenFile ?? `${getFileFromFolder(folder)}`;
    const sourceFile = await readFixtureSourceJayFile(folder, file);
    const parsedFile = checkValidationErrors(parseJayFile(sourceFile, file, dirname, {}));
    const output = generateImportsFileFromJayFile(parsedFile);
    return await prettify(output);
}

export async function astToFormattedCode(node: ts.Node) {
    return prettify(astToCode(node));
}

export async function printStatementWithoutChildStatements(statement: Statement) {
    let printedStatement = (await astToFormattedCode(statement)).trim();

    let childStatements = [];
    const visit = (node: ts.Node) => {
        if (isStatement(node)) childStatements.push(node);
        else node.getChildren().forEach((child) => visit(child));
    };
    statement.getChildren().forEach((child) => visit(child));

    let printedChildStatements = [];
    for await (let childStatement of childStatements) {
        printedChildStatements.push((await astToFormattedCode(childStatement)).trim());
    }

    printedChildStatements.forEach(
        (printedChildStatement) =>
            (printedStatement = printedStatement.replace(printedChildStatement, `/*...*/`)),
    );

    return printedStatement;
}

export function extractVal<T>(context: string, withValidations: WithValidations<T>): T {
    if (withValidations.validations.length > 0)
        throw new Error(`${context}\n${withValidations.validations.join('\n')}`);
    return withValidations.val;
}
