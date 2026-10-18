import { describe, it, expect } from 'vitest';
import { getComponentName } from '../../lib/jay-target/jay-html-helpers';

describe('getComponentName', () => {
    describe('jay-prefixed syntax', () => {
        it('resolves a headless/region contract name', () => {
            expect(getComponentName('jay:section', new Set(), new Set(['section']))).toEqual({
                name: 'section',
                kind: 'headless-instance',
            });
        });

        it('resolves a headful import', () => {
            expect(getComponentName('jay:MyWidget', new Set(['MyWidget']), new Set())).toEqual({
                name: 'MyWidget',
                kind: 'headful',
            });
        });
    });

    describe('legacy bare-tag syntax', () => {
        it('matches a non-HTML bare tag that is an imported symbol', () => {
            expect(getComponentName('MyWidget', new Set(['MyWidget']), new Set())).toEqual({
                name: 'MyWidget',
                kind: 'headful',
            });
        });

        // DL#221 — a component/region named after an HTML tag adds its symbol to importedSymbols;
        // a plain HTML element of that name must stay an HTML element, not a component.
        it('does NOT match a standard HTML tag even when a same-named symbol is imported', () => {
            expect(
                getComponentName('section', new Set(['section']), new Set(['section'])),
            ).toBeNull();
            expect(getComponentName('button', new Set(['button']), new Set())).toBeNull();
            expect(getComponentName('header', new Set(['header']), new Set())).toBeNull();
        });

        it('returns null for a plain HTML tag with no matching import', () => {
            expect(getComponentName('div', new Set(), new Set())).toBeNull();
        });
    });
});
