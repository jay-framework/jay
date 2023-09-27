import { Command } from 'commander';
import { generateElementFile } from 'jay-compiler';
import { generateFiles } from './generate-files';
import { generateDefinitionFiles } from './generate-definition-files';

const program = new Command();
const noop = () => undefined;

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
