import { WithValidations } from 'jay-compiler';
import chalk from 'chalk';
import { findAllJayFiles } from './find-all-jay-files';
import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';

function checkFileExists(filepath): Promise<Boolean> {
    return new Promise((resolve, reject) => {
        fs.access(filepath, fs.constants.F_OK, (error) => {
            resolve(!error);
        });
    });
}

export async function generateFiles(
    dir: string,
    codeGenerationFunction: (
        html: string,
        filename: string,
        filePath: string,
    ) => WithValidations<string>,
    afterGenerationFunction: (html: string, filename: string, filePath: string) => void,
    outputExtension: string,
    destinationDir?: string,
) {
    console.log(chalk.whiteBright('Jay generating files for ', dir));
    let jayFiles = await findAllJayFiles(dir);
    console.log(dir, jayFiles);
    let generationFailed = false;
    for (const jayFile of jayFiles) {
        const content = await fsp.readFile(jayFile, 'utf-8');
        const generatedFile = codeGenerationFunction(
            content,
            path.basename(jayFile.replace('.jay-html', '')),
            path.dirname(jayFile),
        );
        const generateFileName = jayFile + outputExtension;
        if (generatedFile.validations.length > 0) {
            console.log(
                `${chalk.red('failed to generate')} ${chalk.yellow(jayFile)} → ${chalk.yellow(
                    generateFileName,
                )}`,
            );
            generatedFile.validations.forEach((_) => console.log(chalk.red(_)));
            generationFailed = true;
        } else {
            console.log(
                `${chalk.green('generated')} ${chalk.yellow(jayFile)} → ${chalk.yellow(
                    generateFileName,
                )}`,
            );
            let destinationGeneratedFileName;
            if (destinationDir) {
                let absGeneratedFileName = path.resolve(generateFileName);
                let absSourceDir = path.resolve(dir);
                let absDestDir = path.resolve(destinationDir);
                destinationGeneratedFileName = absGeneratedFileName.replace(
                    absSourceDir,
                    absDestDir,
                );
            } else destinationGeneratedFileName = generateFileName;

            let destinationDirName = path.dirname(destinationGeneratedFileName);
            if (!(await checkFileExists(destinationDirName))) {
                await fsp.mkdir(destinationDirName, { recursive: true });
            }
            await fsp.writeFile(destinationGeneratedFileName, generatedFile.val);
        }
        afterGenerationFunction(
            content,
            path.basename(jayFile.replace('.jay-html', '')),
            path.dirname(jayFile),
        );
        if (generationFailed) {
            throw new Error('Jay file generation failed, please fix the issues above.');
        }
    }
}
