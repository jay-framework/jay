import { classNames } from '../../lib';

describe('classNames', () => {
    it('joins truthy class names with a single space', () => {
        expect(classNames('a', 'b', 'c')).toBe('a b c');
    });

    it('drops empty strings left by false conditional classes', () => {
        expect(classNames('a', '', 'c')).toBe('a c');
    });

    it('drops null, undefined and false', () => {
        expect(classNames('a', null, undefined, false, 'b')).toBe('a b');
    });

    it('returns an empty string when nothing is truthy', () => {
        expect(classNames('', false, null, undefined)).toBe('');
    });

    it('returns an empty string with no arguments', () => {
        expect(classNames()).toBe('');
    });
});
