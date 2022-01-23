import {WithValidations} from "jay-compiler";
import chalk from "chalk";
import {findAllJayFiles} from "./find-all-jay-files";
import {promises as fs} from "fs";
import path from "path";

export async function generateFiles(
    dir: string,
    codeGenerationFunction: (html: string, filename: string) => WithValidations<string>,
    outputExtension: string) {

    console.log(chalk.whiteBright('Jay generating definition files for ', dir));
    let jayFiles = await findAllJayFiles(dir)
    for (const jayFile of jayFiles) {
        const content = await fs.readFile(jayFile, 'utf-8');
        const generatedFile = codeGenerationFunction(content, path.basename(jayFile.replace('.jay.html', '')));
        const generateFileName = jayFile + outputExtension;
        if (generatedFile.validations.length > 0) {
            console.log(`${chalk.red('failed to generate')} ${chalk.yellow(jayFile)} → ${chalk.yellow(generateFileName)}`)
            generatedFile.validations.forEach(_ => console.log(chalk.red(_)));
        } else {
            console.log(`${chalk.green('generated')} ${chalk.yellow(jayFile)} → ${chalk.yellow(generateFileName)}`)
            await fs.writeFile(generateFileName, generatedFile.val)
        }
    }
}