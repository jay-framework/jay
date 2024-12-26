import { GenerateTarget, MainRuntimeModes, WithValidations } from 'jay-compiler-shared';
import { JayHtmlSourceFile } from './jay-target/jay-html-source-file';
import {
    generateElementDefinitionFile as generateElementDefinitionFileJayTarget,
    generateElementFile as generateElementFileJayTarget,
} from './jay-target/jay-html-compiler';
import {
    generateElementDefinitionFileReactTarget,
    generateElementFileReactTarget,
} from './react-target/jay-html-compiler-react';
export { generateElementBridgeFile, generateSandboxRootFile } from './jay-target/jay-html-compiler';

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
