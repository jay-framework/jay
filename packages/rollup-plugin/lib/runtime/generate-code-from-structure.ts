import * as ts from 'typescript';
import { transform } from 'typescript';
import {
    checkDiagnosticsErrors,
    checkValidationErrors,
    componentBridgeTransformer,
    componentSandboxTransformer,
    generateElementBridgeFile,
    generateElementFile,
    generateImportsFileFromJayFile,
    generateSandboxRootFile,
    getModeFromExtension,
    JayFile,
    RuntimeMode,
} from 'jay-compiler';
import { PluginContext } from 'rollup';
import { JayPluginContext } from './jay-plugin-context';
import { JayFormat, JayMetadata } from './metadata';
import { writeGeneratedFile } from '../common/files';

export async function generateCodeFromStructure(
    jayContext: JayPluginContext,
    context: PluginContext,
    code: string,
    id: string,
    meta: JayMetadata,
    jayFile: JayFile,
): Promise<string> {
    const { format } = meta;
    const mode = getModeFromExtension(id);
    const tsCode =
        format === JayFormat.JayHtml
            ? generateCodeFromJayHtmlFile(mode, jayFile)
            : generateCodeFromTsFile(jayContext, mode, jayFile, id, code);
    await writeGeneratedFile(jayContext, context, id, tsCode);

    return tsCode;
}

export function generateCodeFromJayHtmlFile(mode: RuntimeMode, jayFile: JayFile): string {
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

function hasSandboxImport(jayFile: JayFile): boolean {
    return jayFile.imports.some((link) => link.sandbox);
}

function generateCodeFromTsFile(
    jayContext: JayPluginContext,
    mode: RuntimeMode,
    jayFile: JayFile,
    id: string,
    code: string,
): string {
    switch (mode) {
        case RuntimeMode.MainTrusted:
            return code;
        case RuntimeMode.MainSandbox: {
            if (!code.includes('makeJayComponent')) return code;
            return transformTsCode(jayContext, [componentBridgeTransformer(mode)], id, code);
        }
        case RuntimeMode.WorkerTrusted:
            return generateImportsFileFromJayFile(jayFile);
        case RuntimeMode.WorkerSandbox:
            return transformTsCode(jayContext, [componentSandboxTransformer()], id, code);
    }
}

function transformTsCode(
    jayContext: JayPluginContext,
    transformers: ts.TransformerFactory<ts.SourceFile>[],
    id: string,
    code: string,
): string {
    const tsSource = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    const tsCode = transform(tsSource, transformers);
    checkDiagnosticsErrors(tsCode);
    const outputCode = jayContext.tsPrinter.printNode(
        ts.EmitHint.Unspecified,
        tsCode.transformed[0],
        tsSource,
    );
    return outputCode;
}
