import { GenerateTarget, MainRuntimeModes, WithValidations } from 'jay-compiler-shared';
import {
    generateElementFile as generateElementFileJayTarget,
    generateElementFileReactTarget,
    JayHtmlSourceFile,
} from 'jay-compiler-jay-html';

export { generateElementDefinitionFile } from 'jay-compiler-jay-html';

export function generateElementFile(
    jayFile: JayHtmlSourceFile,
    importerMode: MainRuntimeModes,
    generateTarget: GenerateTarget = GenerateTarget.jay,
): WithValidations<string> {
    return generateTarget === GenerateTarget.jay
        ? generateElementFileJayTarget(jayFile, importerMode)
        : generateElementFileReactTarget(jayFile, importerMode);
}
