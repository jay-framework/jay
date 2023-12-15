import { cleanDistDirectory, getGeneratedCode, readTestFile } from '../test-utils/file-utils';
import { JAY_QUERY_MAIN_SANDBOX_TS } from 'jay-compiler';
import { generateProject } from '../test-utils/rollup';

describe('jayRuntime plugin - sandbox counter', () => {
    const projectRoot = './test/jayRuntime/fixtures/sandbox-counter';

    beforeAll(async () => {
        await cleanDistDirectory(projectRoot);
    });

    describe('main', () => {
        const isWorker = false;
        const getGeneratedFixturePath = (filename: string) => `generated/main/${filename}`;

        beforeAll(async () => {
            await generateProject(projectRoot, { isWorker });
        });

        describe('main', () => {
            it('generates application container', async () => {
                const filename = 'app.jay-html.ts';
                expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                    await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
                );
            });
        });

        it('generates counter element', async () => {
            const filename = `counter.jay-html${JAY_QUERY_MAIN_SANDBOX_TS}`;
            expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
            );
        });

        it('generates counter component bridge', async () => {
            const filename = `counter${JAY_QUERY_MAIN_SANDBOX_TS}`;
            expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
            );
        });
    });

    describe('worker', () => {
        const isWorker = true;
        const getGeneratedFixturePath = (filename: string) => `generated/worker/${filename}`;

        beforeAll(async () => {
            await generateProject(projectRoot, { isWorker });
        });

        describe('for trusted *.ts file', () => {
            it('generates only imports', async () => {
                const filename = 'index.ts';
                expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                    await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
                );
            });

            describe('for trusted *.jay-html file', () => {
                it('generates sandbox root', async () => {
                    const filename = 'app.jay-html?jay-workerTrusted.ts';
                    expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                        await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
                    );
                });
            });

            describe('for sandbox *.jay-html file', () => {
                it('generates element file', async () => {
                    const filename = 'counter.jay-html?jay-workerSandbox.ts';
                    expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                        await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
                    );
                });
            });

            describe('for sandbox *.ts file', () => {
                it('generates component file', async () => {
                    const filename = 'counter?jay-workerSandbox.ts';
                    expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                        await readTestFile(projectRoot, getGeneratedFixturePath(filename)),
                    );
                });
            });
        });
    });
});
