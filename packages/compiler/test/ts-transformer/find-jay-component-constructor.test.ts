import { mkTransformer } from '../../lib/ts-file/mk-transformer.ts';
import { findJayComponentConstructor } from '../../lib/ts-file/find-jay-component-constructor.ts';
import { transformFile } from '../test-utils/typescript-transformer-test-setup-with-typeschecker.ts';

describe('find jay component constructor', () => {
    it('transform counter component', async () => {
        const callback = vi.fn();

        let { diagnostics } = transformFile(
            './test/fixtures/components/counter/counter.ts',
            (program, checker) => ({
                before: [mkTransformer({ callback, checker }, findJayComponentConstructor)],
            }),
        );
        diagnostics.forEach((line) => console.warn(line));
        expect(callback).toHaveBeenCalled();
    });
});
