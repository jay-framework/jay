import {
    fixtureDir,
    getFileFromFolder, readAndParseJayFile, readFixtureElementDefinitionFile,
    readFixtureFileRaw,
    readFixtureJayContractFile,
} from '../test-utils/file-utils';
import {compileContract, generateElementDefinitionFile, parseContract} from '../../lib';
import { JAY_CONTRACT_EXTENSION, prettify } from 'jay-compiler-shared';
import { JAY_IMPORT_RESOLVER } from '../../lib';

describe('contract definitions', () => {

    describe('generate definition', () => {
        async function testContractDefinitionFile(folder: string) {
            const dirName = fixtureDir(folder);
            const filename = getFileFromFolder(folder);
            const contractContext = await readFixtureJayContractFile(folder, filename);
            const parsedContract = parseContract(contractContext);
            const result = await compileContract(parsedContract, dirName, JAY_IMPORT_RESOLVER);
            expect(await prettify(result.val)).toEqual(
                await prettify(
                    await readFixtureFileRaw(folder, `${filename}${JAY_CONTRACT_EXTENSION}.d.ts`),
                ),
            );
        }

        it('for simple contract', async () => {
            const folder = 'contracts/counter';
            await testContractDefinitionFile(folder);
        });

        it('for contract with links', async () => {
            const folder = 'contracts/named-counter';
            await testContractDefinitionFile(folder);
        });
    })

    describe('generate jay-html definition linked to contract', () => {
        async function testJayHtmlDefinitionFile(folder: string, expectedFile: string) {
            const parsedFile = await readAndParseJayFile(folder);
            let definitionFile = generateElementDefinitionFile(parsedFile);
            expect(definitionFile.validations).toEqual([]);
            expect(await prettify(definitionFile.val)).toEqual(
                await readFixtureElementDefinitionFile(folder, expectedFile),
            );
        }

        it('jay-html linked to contract', async () => {
            const folder = 'contracts/page';
            await testJayHtmlDefinitionFile(folder, 'page.jay-html.d.ts');
        })

    })
});
