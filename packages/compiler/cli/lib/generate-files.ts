import chalk from 'chalk';
import { findAllJayFiles } from './find-all-jay-files';
import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';
import {
    checkValidationErrors,
    CompilerSourceFile,
    GenerateTarget,
    RuntimeMode,
    WithValidations,
} from '@jay-framework/compiler-shared';
import {
    JAY_IMPORT_RESOLVER,
    JayHtmlSourceFile,
    parseJayFile,
} from '@jay-framework/compiler-jay-html';
import { getLogger } from '@jay-framework/logger';

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
        jayFile: CompilerSourceFile,
        importerMode: RuntimeMode,
        generateTarget: GenerateTarget,
    ) => WithValidations<string>,
    afterGenerationFunction: (html: string, filename: string, filePath: string) => void,
    outputExtension: string,
    destinationDir?: string,
    compilationTarget?: string,
    projectRoot?: string,
) {
    const resolvedProjectRoot = projectRoot || process.cwd();
    getLogger().important(chalk.whiteBright('Jay generating files for ', dir));
    let jayFiles = await findAllJayFiles(dir);
    getLogger().info(`${dir} ${JSON.stringify(jayFiles)}`);
    let generationFailed = false;
    for (const jayFile of jayFiles) {
        const content = await fsp.readFile(jayFile, 'utf-8');
        const parsedFile = checkValidationErrors<JayHtmlSourceFile>(
            await parseJayFile(
                content,
                path.basename(jayFile.replace('.jay-html', '')),
                path.dirname(jayFile),
                {},
                JAY_IMPORT_RESOLVER,
                resolvedProjectRoot,
            ),
        );
        const generateTarget: GenerateTarget =
            compilationTarget === 'react' ? GenerateTarget.react : GenerateTarget.jay;
        const generatedFile = codeGenerationFunction(
            parsedFile,
            RuntimeMode.MainTrusted,
            generateTarget,
        );
        const generateFileName = jayFile + outputExtension;
        if (generatedFile.validations.length > 0) {
            getLogger().error(
                `${chalk.red('failed to generate')} ${chalk.yellow(jayFile)} → ${chalk.yellow(
                    generateFileName,
                )}`,
            );
            generatedFile.validations.forEach((_) => getLogger().error(chalk.red(_)));
            generationFailed = true;
        } else {
            getLogger().important(
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
