import {
    fixtureDir,
    getFileFromFolder,
    readFixtureFileRaw,
    readFixtureJayContractFile
} from "../test-utils/file-utils";
import {compileContract, JayImportResolver, parseContract} from "../../lib";
import {JAY_CONTRACT_EXTENSION, prettify} from "jay-compiler-shared";
import {JAY_IMPORT_RESOLVER} from "../../lib/jay-target/jay-import-resolver";

describe('generate contract definition', () => {

    async function doTest(folder: string) {
        const dirName = fixtureDir(folder);
        const filename = getFileFromFolder(folder);
        const contractContext = await readFixtureJayContractFile(folder, filename)
        const parsedContract = parseContract(contractContext);
        const result = await compileContract(parsedContract, dirName, JAY_IMPORT_RESOLVER);
        expect(await prettify(result.val))
            .toEqual(await prettify(await readFixtureFileRaw(folder, `${filename}${JAY_CONTRACT_EXTENSION}.d.ts`)))

    }

    it('for simple contract', async () => {
        const folder = 'contracts/counter';
        await doTest(folder);

    })

    it('for contract with links', async () => {
        const folder = 'contracts/named-counter';
        await doTest(folder);
    })
})