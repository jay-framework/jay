import {promises as fs} from "fs";
import {generateDefinitionFile}  from 'jay-compiler';
import path from "path";
import chalk from 'chalk';

async function findAllJayFiles(dir) {
    let files = await fs.readdir(dir);
    let jayFiles = [];
    for (let file of files)
        if ((await fs.stat(dir + "/" + file)).isDirectory())
            jayFiles = [...jayFiles, ...await findAllJayFiles(dir + "/" + file)]
        else if (file.indexOf('.jay.html') === file.length - 9 && file.indexOf('.jay.html') > 0)
            jayFiles.push(path.join(dir, "/", file))
    return jayFiles;
}

async function run() {
    let dir = process.argv[2];
    console.log(chalk.whiteBright('Jay generating definition files for ', dir));
    let jayFiles = await findAllJayFiles(dir)
    for (const jayFile of jayFiles) {
        const content = await fs.readFile(jayFile, 'utf-8');
        const d = generateDefinitionFile(content, jayFile.replace('.jay.html', ''));
        if (d.validations.length > 0) {
            console.log(`${chalk.red('failed to generate')} ${chalk.yellow(jayFile)} → ${chalk.yellow(jayFile + '.d.js')}`)
            d.validations.forEach(_ => console.log(chalk.red(_)));
        }
        else {
            console.log(`${chalk.green('generated')} ${chalk.yellow(jayFile)} → ${chalk.yellow(jayFile + '.d.js')}`)
            await fs.writeFile(jayFile + '.d.ts', d.val)
        }
    }
}

run();
