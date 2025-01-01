import * as ts from 'typescript';
import { transform } from 'typescript';
import {
    transformComponentBridge,
    transformComponent,
    generateElementFile,
    generateImportsFileFromJayFile,
} from 'jay-compiler';
import { PluginContext } from 'rollup';
import { JayPluginContext } from './jay-plugin-context';
import { JayMetadata } from './metadata';
import { writeGeneratedFile } from '../common/files';
import {
    checkValidationErrors,
    CompilerSourceFile,
    getModeFromExtension,
    RuntimeMode,
    SourceFileFormat,
} from 'jay-compiler-shared';
import {
    generateElementBridgeFile,
    generateSandboxRootFile,
    JayHtmlSourceFile,
} from 'jay-compiler-jay-html';

export function checkDiagnosticsErrors(tsCode: ts.TransformationResult<ts.SourceFile>) {
    if (tsCode.diagnostics.length > 0) {
        throw new Error(
            `typescript transpilation failed ${tsCode.diagnostics
                .map((diagnostic) => diagnostic.toString())
                .join('\n')}`,
        );
    }
}

export async function generateCodeFromStructure(
    jayContext: JayPluginContext,
    context: PluginContext,
    code: string,
    id: string,
    meta: JayMetadata,
    jayFile: CompilerSourceFile,
): Promise<string> {
    const { format } = meta;
    const mode = getModeFromExtension(id);
    const tsCode =
        format === SourceFileFormat.JayHtml
            ? generateCodeFromJayHtmlFile(mode, jayFile as JayHtmlSourceFile)
            : generateCodeFromTsFile(jayContext, mode, jayFile, id, code);
    await writeGeneratedFile(jayContext, context, id, tsCode);
    return tsCode;
}

export function generateCodeFromJayHtmlFile(mode: RuntimeMode, jayFile: JayHtmlSourceFile): string {
    switch (mode) {
        case RuntimeMode.MainTrusted:
        case RuntimeMode.MainSandbox:
            return checkValidationErrors(generateElementFile(jayFile, mode));
        case RuntimeMode.WorkerSandbox:
            return generateElementBridgeFile(jayFile);
        case RuntimeMode.WorkerTrusted:
            return hasSandboxImport(jayFile)
                ? generateSandboxRootFile(jayFile)
                : generateImportsFileFromJayFile(jayFile);
    }
}

function hasSandboxImport(jayFile: CompilerSourceFile): boolean {
    return jayFile.imports.some((link) => link.sandbox);
}

function generateCodeFromTsFile(
    jayContext: JayPluginContext,
    mode: RuntimeMode,
    jayFile: CompilerSourceFile,
    id: string,
    code: string,
): string {
    switch (mode) {
        case RuntimeMode.MainTrusted:
            return code;
        case RuntimeMode.MainSandbox: {
            if (!code.includes('makeJayComponent')) return code;
            return transformTsCode(
                jayContext,
                [
                    transformComponentBridge(
                        mode,
                        jayContext.compilerPatterns,
                        jayContext.globalFunctionsRepository,
                    ),
                ],
                id,
                code,
            );
        }
        case RuntimeMode.WorkerTrusted:
            return generateImportsFileFromJayFile(jayFile);
        case RuntimeMode.WorkerSandbox:
            return transformTsCode(
                jayContext,
                [
                    transformComponent(
                        jayContext.compilerPatterns,
                        jayContext.globalFunctionsRepository,
                    ),
                ],
                id,
                code,
            );
    }
}

function transformTsCode(
    jayContext: JayPluginContext,
    transformers: ts.TransformerFactory<ts.SourceFile>[],
    id: string,
    code: string,
): string {
    const tsSource = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const tsCode = transform(tsSource, transformers);
    checkDiagnosticsErrors(tsCode);
    const outputCode = jayContext.tsPrinter.printNode(
        ts.EmitHint.Unspecified,
        tsCode.transformed[0],
        tsSource,
    );
    return outputCode;
}
