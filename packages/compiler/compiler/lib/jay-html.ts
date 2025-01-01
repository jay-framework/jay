import { GenerateTarget, MainRuntimeModes, WithValidations } from 'jay-compiler-shared';
import {
    generateElementDefinitionFileJayTarget,
    generateElementDefinitionFileReactTarget,
    generateElementFileJayTarget,
    generateElementFileReactTarget,
    JayHtmlSourceFile,
} from 'jay-compiler-jay-html';

export function generateElementDefinitionFile(
    parsedFile: WithValidations<JayHtmlSourceFile>,
    generateTarget: GenerateTarget = GenerateTarget.jay,
): WithValidations<string> {
    return generateTarget === GenerateTarget.jay
        ? generateElementDefinitionFileJayTarget(parsedFile)
        : generateElementDefinitionFileReactTarget(parsedFile);
}

export function generateElementFile(
    jayFile: JayHtmlSourceFile,
    importerMode: MainRuntimeModes,
    generateTarget: GenerateTarget = GenerateTarget.jay,
): WithValidations<string> {
    return generateTarget === GenerateTarget.jay
        ? generateElementFileJayTarget(jayFile, importerMode)
        : generateElementFileReactTarget(jayFile, importerMode);
}
