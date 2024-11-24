import { getJayMetadata, isWorkerRoot, JayMetadata } from '../../../lib/runtime/metadata';
import { mock } from 'vitest-mock-extended';
import { PluginContext } from 'rollup';
import { SourceFileFormat } from 'jay-compiler';

describe('metadata', () => {
    const originId = 'origin/id';
    const originalMeta: JayMetadata = { originId };
    const id = 'id';

    const getContext = (jayMeta: JayMetadata = originalMeta) =>
        mock<PluginContext>({
            getModuleInfo: vi.fn().mockReturnValue({ meta: { jay: jayMeta } }),
        });

    describe('getJayMetadata', () => {
        it('should return metadata', () => {
            const context = getContext();
            expect(getJayMetadata(context, id)).toEqual(originalMeta);
        });

        describe('checkPresent', () => {
            const checkPresent = true;
            const format = SourceFileFormat.JayHtml;

            it('throws error when originId or format is not present', () => {
                expect(
                    getJayMetadata(getContext({ format, originId }), id, { checkPresent }),
                ).toEqual({
                    format,
                    originId,
                });
                expect(() => getJayMetadata(getContext({ format }), id, { checkPresent })).toThrow(
                    'Unknown Jay originId',
                );
                expect(() =>
                    getJayMetadata(getContext({ originId }), id, { checkPresent }),
                ).toThrow('Unknown Jay format');
            });
        });
    });

    describe('isWorkerRoot', () => {
        it('should return false', () => {
            const context = getContext();
            expect(isWorkerRoot(context, id)).toEqual(false);
        });

        describe('when jay metadata has isWorker = true', () => {
            const metadata: JayMetadata = { isWorkerRoot: true };

            it('should return true', () => {
                const context = getContext(metadata);
                expect(isWorkerRoot(context, id)).toEqual(true);
            });
        });
    });
});
