import {
    CollectedImport,
    generateRefsForImportedComponents,
} from './generate-component-refs-files';
import { generateFiles } from './generate-files';
import {
    generateComponentRefsDefinitionFile,
    generateElementDefinitionFile,
    prettify,
} from 'jay-compiler';
import path from 'path';
import { promises as fsp } from 'fs';
import chalk from 'chalk';

export async function generateDefinitionFiles(source, dest) {
    let importsCollector: CollectedImport[] = [];
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
            await fsp.writeFile(refsFileName, await prettify(refsFileContent.val));
        }
    }
}
