import {parseJayFile} from "jay-compiler";
import {JayImportLink} from "jay-compiler/dist/parse-jay-file";

export interface CollectedImport {
    fileName: string
    filePath: string
    link: JayImportLink
}

export function generateRefsForImportedComponents(importsCollector: Array<CollectedImport>) {
    return function (html: string, fileName: string, filePath: string) {
        let parsedFile = parseJayFile(html, fileName, filePath)
        console.log('generate refs for ', fileName, filePath);
        if (parsedFile.validations.length === 0) {
            let jayFile = parsedFile.val
            jayFile.imports.map(link => importsCollector.push({fileName, filePath, link}));
        }
    }
}