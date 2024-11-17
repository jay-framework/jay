import { TS_EXTENSION } from 'jay-compiler';
import { PluginContext } from 'rollup';
import { mock } from 'vitest-mock-extended';
import { readTestFile } from '../../test-utils/file-utils';
import { JayMetadata } from '../../../lib/runtime/metadata';
import { loadJayFile } from '../../../lib/runtime/load';

describe('load', () => {
    describe('loadJayFile', () => {
        const folder = 'jayRuntime/fixtures/counter/source';
        const file = 'app.jay-html';
        const { filePath: originId, code } = readTestFile(folder, file);
        const id = `${originId}${TS_EXTENSION}`;
        const meta: { jay: JayMetadata } = { jay: { originId } };

        const getContext = ({ meta }: { meta?: { jay?: JayMetadata } } = {}) =>
            mock<PluginContext>({ getModuleInfo: vi.fn().mockReturnValue({ meta }) });

        it('loads origin file', async () => {
            const context = getContext({ meta });

            expect(await loadJayFile(context, id)).toEqual({ code });
        });

        describe('when originId is not defined', () => {
            const meta = {};

            it('returns null', async () => {
                const context = getContext({ meta });
                expect(await loadJayFile(context, id)).toBeNull();
            });
        });
    });
});
