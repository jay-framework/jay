import {
    fixtureDir,
    getFileFromFolder,
    readAndParseJayFile,
    readFixtureElementDefinitionFile,
    readFixtureFileRaw,
    readFixtureJayContractFile,
} from '../test-utils/file-utils';
import { compileContract, generateElementDefinitionFile, parseContract } from '../../lib';
import { JAY_CONTRACT_EXTENSION, prettify } from '@jay-framework/compiler-shared';
import { JAY_IMPORT_RESOLVER } from '../../lib';

describe('contract definitions', () => {
    describe('generate definition', () => {
        async function testContractDefinitionFile(folder: string) {
            const dirName = fixtureDir(folder);
            const filename = getFileFromFolder(folder);
            const contractFilePath = `${dirName}/${filename}.jay-contract`;
            const contractContext = await readFixtureJayContractFile(folder, filename);
            const parsedContract = parseContract(contractContext, `${filename}.jay-contract`);
            const result = await compileContract(
                parsedContract,
                contractFilePath,
                JAY_IMPORT_RESOLVER,
            );
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
    });

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
            const folder = 'contracts/page-using-counter';
            await testJayHtmlDefinitionFile(folder, 'page-using-counter.jay-html.d.ts');
        });

        it('jay-html linked to contract with transitive enum imports', async () => {
            const folder = 'contracts/page-using-named-counter';
            await testJayHtmlDefinitionFile(folder, 'page-using-named-counter.jay-html.d.ts');
        });
    });
});
