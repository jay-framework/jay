import { GenerateTarget, MainRuntimeModes, WithValidations } from '@jay-framework/compiler-shared';
import {
    generateElementFile as generateElementFileJayTarget,
    generateElementFileReactTarget,
    JayHtmlSourceFile,
    JayHtmlCompilerOptions,
} from '@jay-framework/compiler-jay-html';

export { generateElementDefinitionFile } from '@jay-framework/compiler-jay-html';

export function generateElementFile(
    jayFile: JayHtmlSourceFile,
    importerMode: MainRuntimeModes,
    generateTarget: GenerateTarget = GenerateTarget.jay,
    options?: JayHtmlCompilerOptions,
): WithValidations<string> {
    return generateTarget === GenerateTarget.jay
        ? generateElementFileJayTarget(jayFile, importerMode, options)
        : generateElementFileReactTarget(jayFile, importerMode);
}
