import {ConstructContext, dynamicAttribute as da, element as e, ReferencesManager, svgElement as svg} from '../../lib';

const refName = 'ref1'

describe('elements with namespace', () => {
    describe('svg', () => {

        interface ViewState {
            color: string
        }
        function mkSvgElement(vs: ViewState) {
            const [refManager, [ref1]] = ReferencesManager.for({}, [refName], [], [], []);
            const jayElement = ConstructContext.withRootContext(vs, refManager, () =>
                svg('svg', { width: '200', height: '200', viewBox: '0 0 200' }, [
                    svg('circle', { cx: '100', cy: '100', r: '50', fill: da(vs => vs.color) }, [], ref1()),
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

        it('should support events on svg', () => {
            const fn = vitest.fn();
            const {jayElement} = mkSvgElement({color: 'blue'})
            jayElement.refs[refName].onclick(fn);

            (jayElement.dom as SVGElement).getElementsByTagName('circle')[0]
                .dispatchEvent(new window.Event('click'));

            expect(fn).toHaveBeenCalled()
        });
    });
});
