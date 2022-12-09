import {CollectedImport, generateRefsForImportedComponents} from "./generate-component-refs-files";
import {generateFiles} from "./generate-files";
import {generateDefinitionFile, generateRefsFile} from "jay-compiler";
import path from "path";
import {promises as fsp} from "fs";
import chalk from "chalk";

export async function generateDefinitionFiles(source, dest) {
    let importsCollector: CollectedImport[] = [];
    await generateFiles(source, generateDefinitionFile, generateRefsForImportedComponents(importsCollector), '.d.ts', dest)
    let componentFiles = importsCollector.map(_ => path.resolve(_.filePath, _.link.module))
    let uniqueComponentFiles = new Set(componentFiles);
    console.log(chalk.whiteBright('Jay generating component definition files'));
    for (let componentFilePath of uniqueComponentFiles) {

        let refsFileContent = generateRefsFile(componentFilePath);
        let refsFileName = componentFilePath + '-refs.d.ts';
        if (refsFileContent.validations.length > 0) {
            console.log(`${chalk.red('failed to generate')} ${chalk.yellow(componentFilePath)}.ts → ${chalk.yellow(refsFileName)}`)
            refsFileContent.validations.forEach(_ => console.log(chalk.red(_)));
        }
        else {
            console.log(`${chalk.green('generated')} ${chalk.yellow(componentFilePath)}.ts → ${chalk.yellow(refsFileName)}`)
            await fsp.writeFile(refsFileName, refsFileContent.val);
        }
    }
}