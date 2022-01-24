import {Command} from 'commander';
import {generateDefinitionFile, generateRuntimeFile} from 'jay-compiler';
import {generateFiles} from "./generate-files";

const program = new Command();

program.command('definitions')
    .argument('<source>', 'source folder to scan for .jay.html files')
    .argument('[destination]', 'destination folder for generated files')
    .description('generate definition files (.d.ts) for jay files')
    .action((source, dest) => {
        generateFiles(source, generateDefinitionFile, '.d.ts', dest)
    })

program.command('runtime')
    .argument('<source>', 'source folder to scan for .jay.html files')
    .argument('[destination]', 'destination folder for generated files')
    .description('generate code files (.ts) for jay files')
    .action((source, dest) => {
        generateFiles(source, generateRuntimeFile, '.ts', dest)
    })

program.parse(process.argv);