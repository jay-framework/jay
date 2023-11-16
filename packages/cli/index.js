import { Command } from 'commander';
import {
    generateComponentRefsDefinitionFile,
    generateElementDefinitionFile,
    generateElementFile,
    parseJayFile,
} from 'jay-compiler';
import chalk from 'chalk';
import fs, { promises } from 'fs';
import path from 'path';

async function findAllJayFiles(dir) {
    let files = await promises.readdir(dir);
    let jayFiles = [];
    for (let file of files)
        if ((await promises.stat(dir + '/' + file)).isDirectory())
            jayFiles = [...jayFiles, ...(await findAllJayFiles(dir + '/' + file))];
        else if (file.endsWith('.jay.html') && !file.startsWith('.jay.html'))
            jayFiles.push(path.join(dir, '/', file));
    return jayFiles;
}
function checkFileExists(filepath) {
    return new Promise((resolve, reject) => {
        fs.access(filepath, fs.constants.F_OK, (error) => {
            resolve(!error);
        });
    });
}
async function generateFiles(
    dir,
    codeGenerationFunction,
    afterGenerationFunction,
    outputExtension,
    destinationDir,
) {
    console.log(chalk.whiteBright('Jay generating definition files for ', dir));
    let jayFiles = await findAllJayFiles(dir);
    let generationFailed = false;
    for (const jayFile of jayFiles) {
        const content = await promises.readFile(jayFile, 'utf-8');
        const generatedFile = codeGenerationFunction(
            content,
            path.basename(jayFile.replace('.jay.html', '')),
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
                await promises.mkdir(destinationDirName, { recursive: true });
            }
            await promises.writeFile(destinationGeneratedFileName, generatedFile.val);
        }
        afterGenerationFunction(
            content,
            path.basename(jayFile.replace('.jay.html', '')),
            path.dirname(jayFile),
        );
        if (generationFailed) {
            throw new Error('Jay file generation failed, please fix the issues above.');
        }
    }
}
function generateRefsForImportedComponents(importsCollector) {
    return function (html, fileName, filePath) {
        let parsedFile = parseJayFile(html, fileName, filePath);
        console.log('generate refs for ', fileName, filePath);
        if (parsedFile.validations.length === 0) {
            let jayFile = parsedFile.val;
            jayFile.imports.map((link) => importsCollector.push({ fileName, filePath, link }));
        }
    };
}
async function generateDefinitionFiles(source, dest) {
    let importsCollector = [];
    await generateFiles(
        source,
        generateElementDefinitionFile,
        generateRefsForImportedComponents(importsCollector),
        '.d.ts',
        dest,
    );
    let componentFiles = importsCollector.map((_) => path.resolve(_.filePath, _.link.module));
    let uniqueComponentFiles = new Set(componentFiles);
    console.log(chalk.whiteBright('Jay generating component definition files'));
    for (let componentFilePath of uniqueComponentFiles) {
        let refsFileContent = generateComponentRefsDefinitionFile(componentFilePath);
        let refsFileName = componentFilePath + '-refs.d.ts';
        let relativeComponentFilePath = path.relative(process.cwd(), componentFilePath);
        let relativeRefsFileName = path.relative(process.cwd(), refsFileName);
        if (refsFileContent.validations.length > 0) {
            console.log(
                `${chalk.red('failed to generate')} ${chalk.yellow(
                    relativeComponentFilePath,
                )}.ts → ${chalk.yellow(relativeRefsFileName)}`,
            );
            refsFileContent.validations.forEach((_) => console.log(chalk.red(_)));
        } else {
            console.log(
                `${chalk.green('generated')} ${chalk.yellow(
                    relativeComponentFilePath,
                )}.ts → ${chalk.yellow(relativeRefsFileName)}`,
            );
            await promises.writeFile(refsFileName, refsFileContent.val);
        }
    }
}
const program = new Command();
const noop = () => void 0;
program
    .command('definitions')
    .argument('<source>', 'source folder to scan for .jay.html files')
    .argument('[destination]', 'destination folder for generated files')
    .description('generate definition files (.d.ts) for jay files')
    .action(async (source, dest) => {
        await generateDefinitionFiles(source, dest);
    });
program
    .command('runtime')
    .argument('<source>', 'source folder to scan for .jay.html files')
    .argument('[destination]', 'destination folder for generated files')
    .description('generate code files (.ts) for jay files')
    .action((source, dest) => {
        generateFiles(source, generateElementFile, noop, '.ts', dest);
    });
program.parse(process.argv);
//# sourceMappingURL=index.js.map
