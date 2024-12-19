import {MainRuntimeModes, WithValidations} from "jay-compiler-shared";
import {JayHtmlSourceFile} from "../jay-target/jay-html-source-file";

export function generateElementDefinitionFileReactTarget(
    parsedFile: WithValidations<JayHtmlSourceFile>
): WithValidations<string> {
    return null;
}

export function generateElementFileReactTarget(
    jayFile: JayHtmlSourceFile,
    importerMode: MainRuntimeModes
): WithValidations<string> {
    return null;
}
