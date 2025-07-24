import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { transform } = tsModule;
import {
    transformComponentBridge,
    transformComponent,
    generateElementFile,
    generateImportsFileFromJayFile,
} from '@jay-framework/compiler';
import { PluginContext } from 'rollup';
import { JayPluginContext } from './jay-plugin-context';
import { JayMetadata } from './metadata';
import { writeGeneratedFile } from '../common/files';
import {
    checkValidationErrors,
    CompilerSourceFile,
    GenerateTarget,
    getModeFromExtension,
    RuntimeMode,
    SourceFileFormat,
} from '@jay-framework/compiler-shared';
import {
    generateElementBridgeFile,
    generateSandboxRootFile,
    JayHtmlSourceFile,
} from '@jay-framework/compiler-jay-html';

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
    const generationTarget: GenerateTarget =
        jayContext.jayOptions.generationTarget || GenerateTarget.jay;
    const tsCode =
        format === SourceFileFormat.JayHtml
            ? generateCodeFromJayHtmlFile(mode, jayFile as JayHtmlSourceFile, generationTarget)
            : generateCodeFromTsFile(jayContext, mode, jayFile, id, code);
    await writeGeneratedFile(jayContext, context, id, tsCode);
    return tsCode;
}

export function generateCodeFromJayHtmlFile(
    mode: RuntimeMode,
    jayFile: JayHtmlSourceFile,
    generationTarget: GenerateTarget,
): string {
    switch (mode) {
        case RuntimeMode.MainTrusted:
        case RuntimeMode.MainSandbox:
            return checkValidationErrors(generateElementFile(jayFile, mode, generationTarget));
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
    const tsSource = tsModule.createSourceFile(
        id,
        code,
        tsModule.ScriptTarget.Latest,
        true,
        tsModule.ScriptKind.TS,
    );
    const tsCode = transform(tsSource, transformers);
    checkDiagnosticsErrors(tsCode);
    const outputCode = jayContext.tsPrinter.printNode(
        tsModule.EmitHint.Unspecified,
        tsCode.transformed[0],
        tsSource,
    );
    return outputCode;
}
