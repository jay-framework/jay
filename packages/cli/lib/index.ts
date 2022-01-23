import {Command} from 'commander';
import {generateDefinitionFile} from 'jay-compiler';
import {generateFiles} from "./generate-files";

const program = new Command();

program.command('definitions')
    .argument('<source>', 'source folder to scan for .jay.html files')
    .description('generate definition files (.d.ts) for jay files')
    .action((source) => {
        generateFiles(source, generateDefinitionFile, '.d.ts')
    })

program.command('runtime')
    .argument('<source>', 'source folder to scan for .jay.html files')
    .description('generate code files (.ts) for jay files')
    .action((source) => {
        generateFiles(source, generateDefinitionFile, '.ts')
    })

program.parse(process.argv);