import {ConstructContext, dynamicAttribute as da, element as e, ReferencesManager, svgElement as svg} from '../../lib';
const { JSDOM } = require('jsdom');

describe('elements with namespace', () => {
    describe('svg', () => {

        interface ViewState {
            color: string
        }
        function mkSvgElement(vs: ViewState) {
            const [refManager, []] = ReferencesManager.for({}, [], [], [], []);
            const jayElement = ConstructContext.withRootContext(vs, refManager, () =>
                svg('svg', { width: '200', height: '200', viewBox: '0 0 200' }, [
                    svg('circle', { cx: '100', cy: '100', r: '50', fill: da(vs => vs.color) }, []),
                ]),
            );
            return {jayElement}
        }

        it('should create svg element', () => {
            const {jayElement} = mkSvgElement({color: 'blue'})

            expect(jayElement.dom.outerHTML).toBe('<svg width="200" height="200" viewBox="0 0 200"><circle cx="100" cy="100" r="50" fill="blue"></circle></svg>');
        });

        it('should support dynamic attribute', () => {
            const {jayElement} = mkSvgElement({color: 'blue'})
            jayElement.update({color: 'red'})

            expect(jayElement.dom.outerHTML).toBe('<svg width="200" height="200" viewBox="0 0 200"><circle cx="100" cy="100" r="50" fill="red"></circle></svg>');
        });
    });
});
