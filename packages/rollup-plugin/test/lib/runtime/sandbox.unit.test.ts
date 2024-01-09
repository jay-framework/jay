import { hasPrefix, SANDBOX_ROOT_PREFIX, withoutPrefix } from '../../../lib/runtime/sandbox';

describe('sandbox', () => {
    const module = './app.jay-html';

    describe('hasPrefix', () => {
        it('should return true when file starts with the prefix', () => {
            expect(hasPrefix(`${SANDBOX_ROOT_PREFIX}${module}`, SANDBOX_ROOT_PREFIX)).toBe(true);
            expect(hasPrefix(SANDBOX_ROOT_PREFIX, SANDBOX_ROOT_PREFIX)).toBe(false);
            expect(hasPrefix(module, SANDBOX_ROOT_PREFIX)).toBe(false);
        });
    });

    describe('withoutPrefix', () => {
        it('should return the filename without the prefix', () => {
            expect(withoutPrefix(`${SANDBOX_ROOT_PREFIX}${module}`, SANDBOX_ROOT_PREFIX)).toEqual(
                module,
            );
        });

        describe('on file does not start with the prefix', () => {
            it('should slice first prefix.length characters', () => {
                expect(withoutPrefix(module, SANDBOX_ROOT_PREFIX)).toEqual('ml');
            });
        });
    });
});
