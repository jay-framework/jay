import { svgElement as svg } from '../../lib';
const { JSDOM } = require('jsdom');

describe('elements with namespace', () => {
    describe('svg', () => {
        it('should create svg element', () => {
            const jayElement = svg('svg', { width: '200', height: '200', viewBox: '0 0 200' }, [
                svg('circle', { cx: '100', cy: '100', r: '50', fill: 'blue' }, []),
            ]);

            expect(jayElement.dom.outerHTML).toBe('<svg><circle></circle></svg>');
        });
    });
});
