import {
    appendJayMetadata,
    getJayMetadata,
    JayFormat,
    JayMetadata,
} from '../../../lib/runtime/metadata';
import { mock } from 'vitest-mock-extended';
import { PluginContext } from 'rollup';

describe('metadata', () => {
    const originalMeta: JayMetadata = { originalId: 'original' };
    const id = 'id';

    const getContext = (jayMeta: JayMetadata = originalMeta) =>
        mock<PluginContext>({
            getModuleInfo: vi.fn().mockReturnValue({ meta: { jay: jayMeta } }),
        });

    describe('appendJayMetadata', () => {
        const metadata: JayMetadata = { format: JayFormat.Typescript };

        it('should append metadata', () => {
            const context = getContext();
            expect(appendJayMetadata(context, id, metadata)).toEqual({
                jay: {
                    originalId: 'original',
                    format: 'typescript',
                },
            });
        });
    });

    describe('getJayMetadata', () => {
        it('should return metadata', () => {
            const context = getContext();
            expect(getJayMetadata(context, id)).toEqual(originalMeta);
        });
    });
});
