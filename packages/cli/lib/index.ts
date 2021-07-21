import {promises as fs} from "fs";
import {generateDefinitionFile}  from 'jay-compiler';
import path from "path";
import chalk from 'chalk';

async function run() {
    let dir = process.argv[2];
    console.log(chalk.whiteBright('Jay generating definition files for ', dir));
    let allFiles = await fs.readdir(dir)
    const jayFiles = allFiles.filter(_ => _.indexOf('.jay.html') === _.length - 9 && _.indexOf('.jay.html') > 0)
    for (const jayFile of jayFiles) {
        const content = await fs.readFile(path.join(dir, jayFile), 'utf-8');
        const d = generateDefinitionFile(content, jayFile.replace('.jay.html', ''));
        console.log(`${chalk.green('generated')} ${chalk.yellow(jayFile)} → ${chalk.yellow(jayFile + '.d.js')}`)
        await fs.writeFile(path.join(dir, jayFile + '.d.ts'), d.val)
    }
}

run();
