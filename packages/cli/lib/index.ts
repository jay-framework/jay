import { rollup } from 'rollup';
import { Command } from 'commander';
import { generateElementFile } from 'jay-compiler';
import { jayDefinitions } from 'rollup-plugin-jay';
import { generateFiles } from './generate-files';
import { getJayHtmlFileInputs } from './inputs';

const program = new Command();
const noop = () => undefined;

program
    .command('definitions')
    .argument('<source>', 'source folder to scan for .jay-html files')
    .description('generate definition files (.d.ts) for jay files')
    .action(async (source) => {
        await rollup({
            input: getJayHtmlFileInputs(source),
            plugins: [jayDefinitions()],
        });
    });

program
    .command('runtime')
    .argument('<source>', 'source folder to scan for .jay-html files')
    .argument('[destination]', 'destination folder for generated files')
    .description('generate code files (.ts) for jay files')
    .action(async (source, dest) => {
        await generateFiles(source, generateElementFile, noop, '.ts', dest);
    });

program.parse(process.argv);
