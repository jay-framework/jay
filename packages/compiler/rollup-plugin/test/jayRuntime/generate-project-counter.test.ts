import { cleanDistDirectory, getExpectedCode, getGeneratedCode } from '../test-utils/file-utils';
import {
    JAY_QUERY_MAIN_SANDBOX_TS,
    JAY_QUERY_WORKER_SANDBOX_TS,
    JAY_QUERY_WORKER_TRUSTED_TS,
    TS_EXTENSION,
} from '@jay-framework/compiler-shared';
import { generateProject } from '../test-utils/rollup';

describe('jayRuntime plugin - counter', () => {
    const projectRoot = './test/jayRuntime/fixtures/counter';

    beforeAll(async () => {
        await cleanDistDirectory(projectRoot);
    });

    describe('main', () => {
        const isWorker = false;

        beforeAll(async () => {
            await generateProject(projectRoot, { isWorker });
        }, 1000000);

        describe('main', () => {
            it('generates application container', async () => {
                const filename = 'app.jay-html.ts';
                expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                    await getExpectedCode(projectRoot, filename, isWorker),
                );
            });
        });

        it('generates counter element', async () => {
            const filename = `counter.jay-html${JAY_QUERY_MAIN_SANDBOX_TS}`;
            expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                await getExpectedCode(projectRoot, filename, isWorker),
            );
        });

        it('generates counter component bridge', async () => {
            const filename = `counter${TS_EXTENSION}${JAY_QUERY_MAIN_SANDBOX_TS}`;
            expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                await getExpectedCode(projectRoot, filename, isWorker),
            );
        });
    });

    describe('worker', () => {
        const isWorker = true;

        beforeAll(async () => {
            await generateProject(projectRoot, { isWorker });
        });

        describe('for trusted *.ts file', () => {
            it('generates only imports', async () => {
                const filename = `sandbox-root.ts${JAY_QUERY_WORKER_TRUSTED_TS}`;
                expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                    await getExpectedCode(projectRoot, filename, isWorker),
                );
            });

            describe('for trusted *.jay-html file', () => {
                it('generates sandbox root', async () => {
                    const filename = `app.jay-html${JAY_QUERY_WORKER_TRUSTED_TS}`;
                    expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                        await getExpectedCode(projectRoot, filename, isWorker),
                    );
                });
            });

            describe('for sandbox *.jay-html file', () => {
                it('generates element file', async () => {
                    const filename = `counter.jay-html${JAY_QUERY_WORKER_SANDBOX_TS}`;
                    expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                        await getExpectedCode(projectRoot, filename, isWorker),
                    );
                });
            });

            describe('for sandbox *.ts file', () => {
                it('generates component file', async () => {
                    const filename = `counter${TS_EXTENSION}${JAY_QUERY_WORKER_SANDBOX_TS}`;
                    expect(await getGeneratedCode(projectRoot, filename, isWorker)).toEqual(
                        await getExpectedCode(projectRoot, filename, isWorker),
                    );
                });
            });
        });
    });
});
