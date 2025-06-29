import { GenerateTarget, MainRuntimeModes, WithValidations } from '@jay-framework/compiler-shared';
import {
    generateElementFile as generateElementFileJayTarget,
    generateElementFileReactTarget,
    JayHtmlSourceFile,
} from '@jay-framework/compiler-jay-html';

export { generateElementDefinitionFile } from '@jay-framework/compiler-jay-html';

export function generateElementFile(
    jayFile: JayHtmlSourceFile,
    importerMode: MainRuntimeModes,
    generateTarget: GenerateTarget = GenerateTarget.jay,
): WithValidations<string> {
    return generateTarget === GenerateTarget.jay
        ? generateElementFileJayTarget(jayFile, importerMode)
        : generateElementFileReactTarget(jayFile, importerMode);
}
