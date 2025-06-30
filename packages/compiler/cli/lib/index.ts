import { rollup } from 'rollup';
import { Command } from 'commander';
import { generateElementFile } from '@jay-framework/compiler';
import { jayDefinitions } from '@jay-framework/rollup-plugin';
import { generateFiles } from './generate-files';
import { getJayHtmlOrContractFileInputs } from './find-all-jay-element-contract-files';

const program = new Command();
const noop = () => undefined;

program
    .command('definitions')
    .argument('<source>', 'source folder to scan for .jay-html files')
    .description('generate definition files (.d.ts) for jay files')
    .action(async (source) => {
        await rollup({
            input: getJayHtmlOrContractFileInputs(source),
            plugins: [jayDefinitions()],
        });
    });

program
    .command('runtime')
    .argument('<source>', 'source folder to scan for .jay-html files')
    .argument('[destination]', 'destination folder for generated files')
    .argument('[compilationTarget]', 'jay | react. target runtime to compile for. Defaults to jay')
    .description('generate code files (.ts) for jay files')
    .action(async (source, dest, compilationTarget) => {
        await generateFiles(source, generateElementFile, noop, '.ts', dest, compilationTarget);
    });

program.parse(process.argv);
