import { JayPluginContext } from './jay-plugin-context';
import * as ts from 'typescript';
import { transform } from 'typescript';
import { checkDiagnosticsErrors, checkValidationErrors } from '../common/errors';
import {
    componentBridgeTransformer,
    componentSandboxTransformer,
    generateElementBridgeFile,
    generateElementFile,
    generateImportsFileFromTsSource,
    generateSandboxRootFile,
    JayFile,
    RuntimeMode,
    WithValidations,
} from 'jay-compiler';
import { generateImportsFileFromJayFile } from '../../../compiler/lib/ts-file/generate-imports-file';

export function transformTsCode(
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

export function transformJayHtmlParsedFile(
    jayContext: JayPluginContext,
    mode: RuntimeMode,
    parsedFile: WithValidations<JayFile>,
): string {
    if (jayContext.isMain) return validatedCode(generateElementFile(parsedFile, mode));

    if (mode === RuntimeMode.SandboxWorker)
        return validatedCode(generateElementBridgeFile(parsedFile));

    if (hasSandboxImport(parsedFile)) return validatedCode(generateSandboxRootFile(parsedFile));

    return generateImportsFileFromJayFile(parsedFile);
}

function hasSandboxImport(parsedFile: WithValidations<JayFile>): boolean {
    return parsedFile.val.imports.some((link) => link.sandbox);
}

export function transformJayTsCode(
    jayContext: JayPluginContext,
    mode: RuntimeMode,
    id: string,
    code: string,
): string {
    if (jayContext.isMain) {
        if (mode === RuntimeMode.Trusted) return code;
        if (!code.includes('makeJayComponent')) return code;
        return transformTsCode(jayContext, [componentBridgeTransformer(mode)], id, code);
    }

    if (mode === RuntimeMode.SandboxWorker)
        return transformTsCode(jayContext, [componentSandboxTransformer()], id, code);

    return generateImportsFileFromTsSource(id, code);
}

function validatedCode(code: WithValidations<string>): string {
    checkValidationErrors(code.validations);
    return code.val;
}
