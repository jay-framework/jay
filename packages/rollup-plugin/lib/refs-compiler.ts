import chalk from 'chalk';
import { generateComponentRefsDefinitionFile, JayImportLink, prettify } from 'jay-compiler';
import path from 'node:path';
import { promises as fsp } from 'node:fs';

export function getRefsFilePaths(
    generatedRefPaths: Set<string>,
    dirname: string,
    imports: JayImportLink[],
): string[] {
    const refPaths = imports
        .map((link) => path.resolve(dirname, link.module))
        .filter((refPath) => !refPath.includes('.jay.html'));
    return refPaths.filter((path) => !generatedRefPaths.has(path));
}

export async function generateRefsComponents(refPaths: string[]): Promise<void> {
    await Promise.all(
        refPaths.map(async (refPath) => {
            const refsFileContent = generateComponentRefsDefinitionFile(refPath);
            const refsFileName = refPath + '-refs.d.ts';
            const relativeComponentFilePath = path.relative(process.cwd(), refPath);
            const relativeRefsFileName = path.relative(process.cwd(), refsFileName);
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
        }),
    );
}
