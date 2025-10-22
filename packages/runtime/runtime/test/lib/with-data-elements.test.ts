import {
    withData,
    dynamicElement as de,
    element as e,
    dynamicText as dt,
} from '../../lib/';
import { JayElement, ReferencesManager } from '../../lib';
import { ConstructContext } from '../../lib';

describe('withData-element', () => {
    interface ParentViewState {
        parentName: string;
        child: ChildViewState | null;
    }

    interface ChildViewState {
        childName: string;
        value: number;
    }

    describe('rendering', () => {
        function makeElement(data: ParentViewState): JayElement<ParentViewState, any> {
            let [refManager, []] = ReferencesManager.for({}, [], [], [], []);
            return ConstructContext.withRootContext(data, refManager, () =>
                de('div', { id: 'parent' }, [
                    e('div', { id: 'parent-name' }, [dt((vs) => vs.parentName)]),
                    withData(
                        (vs) => vs.child,
                        () =>
                            e('div', { id: 'child' }, [
                                e('span', { id: 'child-name' }, [dt((vs) => vs.childName)]),
                                e('span', { id: 'child-value' }, [dt((vs) => vs.value)]),
                            ]),
                    ),
                ]),
            );
        }

        it('should render child when child data exists', () => {
            let jayElement = makeElement({
                parentName: 'Parent',
                child: { childName: 'Child', value: 42 },
            });
            
            expect(jayElement.dom.querySelector('#parent-name')).toHaveTextContent('Parent');
            expect(jayElement.dom.querySelector('#child')).not.toBeNull();
            expect(jayElement.dom.querySelector('#child-name')).toHaveTextContent('Child');
            expect(jayElement.dom.querySelector('#child-value')).toHaveTextContent('42');
        });

        it('should not render child when child data is null', () => {
            let jayElement = makeElement({
                parentName: 'Parent',
                child: null,
            });
            
            expect(jayElement.dom.querySelector('#parent-name')).toHaveTextContent('Parent');
            expect(jayElement.dom.querySelector('#child')).toBeNull();
        });

        it('should not render child when child data is undefined', () => {
            let jayElement = makeElement({
                parentName: 'Parent',
                child: undefined,
            });
            
            expect(jayElement.dom.querySelector('#parent-name')).toHaveTextContent('Parent');
            expect(jayElement.dom.querySelector('#child')).toBeNull();
        });
    });

    describe('updates', () => {
        function makeElement(data: ParentViewState): JayElement<ParentViewState, any> {
            let [refManager, []] = ReferencesManager.for({}, [], [], [], []);
            return ConstructContext.withRootContext(data, refManager, () =>
                de('div', { id: 'parent' }, [
                    e('div', { id: 'parent-name' }, [dt((vs) => vs.parentName)]),
                    withData(
                        (vs) => vs.child,
                        () =>
                            e('div', { id: 'child' }, [
                                e('span', { id: 'child-name' }, [dt((vs) => vs.childName)]),
                                e('span', { id: 'child-value' }, [dt((vs) => vs.value)]),
                            ]),
                    ),
                ]),
            );
        }

        it('should update child data when parent updates', () => {
            let jayElement = makeElement({
                parentName: 'Parent',
                child: { childName: 'Child1', value: 42 },
            });
            
            jayElement.update({
                parentName: 'Parent',
                child: { childName: 'Child2', value: 99 },
            });
            
            expect(jayElement.dom.querySelector('#child-name')).toHaveTextContent('Child2');
            expect(jayElement.dom.querySelector('#child-value')).toHaveTextContent('99');
        });

        it('should show child when updated from null to valid data', () => {
            let jayElement = makeElement({
                parentName: 'Parent',
                child: null,
            });
            
            expect(jayElement.dom.querySelector('#child')).toBeNull();
            
            jayElement.update({
                parentName: 'Parent',
                child: { childName: 'NewChild', value: 123 },
            });
            
            expect(jayElement.dom.querySelector('#child')).not.toBeNull();
            expect(jayElement.dom.querySelector('#child-name')).toHaveTextContent('NewChild');
            expect(jayElement.dom.querySelector('#child-value')).toHaveTextContent('123');
        });

        it('should hide child when updated from valid data to null', () => {
            let jayElement = makeElement({
                parentName: 'Parent',
                child: { childName: 'Child', value: 42 },
            });
            
            expect(jayElement.dom.querySelector('#child')).not.toBeNull();
            
            jayElement.update({
                parentName: 'Parent',
                child: null,
            });
            
            expect(jayElement.dom.querySelector('#child')).toBeNull();
        });

        it('should update parent name without affecting child', () => {
            let jayElement = makeElement({
                parentName: 'Parent1',
                child: { childName: 'Child', value: 42 },
            });
            
            jayElement.update({
                parentName: 'Parent2',
                child: { childName: 'Child', value: 42 },
            });
            
            expect(jayElement.dom.querySelector('#parent-name')).toHaveTextContent('Parent2');
            expect(jayElement.dom.querySelector('#child-name')).toHaveTextContent('Child');
        });
    });

    describe('nested accessor usage', () => {
        interface Container {
            name: string;
            inner: InnerContainer | null;
        }

        interface InnerContainer {
            title: string;
            value: number;
        }

        function makeNestedElement(data: Container): JayElement<Container, any> {
            let [refManager, []] = ReferencesManager.for({}, [], [], [], []);
            return ConstructContext.withRootContext(data, refManager, () =>
                de('div', { class: 'container' }, [
                    e('div', { class: 'name' }, [dt((vs) => vs.name)]),
                    withData(
                        (vs) => vs.inner,
                        () =>
                            e('div', { class: 'inner' }, [
                                e('span', { class: 'title' }, [dt((vs) => vs.title)]),
                                e('span', { class: 'value' }, [dt((vs) => vs.value)]),
                            ]),
                    ),
                ]),
            );
        }

        it('should render nested structure with inner data', () => {
            let container: Container = {
                name: 'Outer',
                inner: {
                    title: 'Inner',
                    value: 123,
                },
            };
            
            let jayElement = makeNestedElement(container);
            
            expect(jayElement.dom.querySelector('.name')).toHaveTextContent('Outer');
            expect(jayElement.dom.querySelector('.inner')).not.toBeNull();
            expect(jayElement.dom.querySelector('.title')).toHaveTextContent('Inner');
            expect(jayElement.dom.querySelector('.value')).toHaveTextContent('123');
        });

        it('should handle null inner data', () => {
            let container: Container = {
                name: 'Outer',
                inner: null,
            };
            
            let jayElement = makeNestedElement(container);
            
            expect(jayElement.dom.querySelector('.name')).toHaveTextContent('Outer');
            expect(jayElement.dom.querySelector('.inner')).toBeNull();
        });

        it('should update from null to valid inner data', () => {
            let container: Container = {
                name: 'Outer',
                inner: null,
            };
            
            let jayElement = makeNestedElement(container);
            expect(jayElement.dom.querySelector('.inner')).toBeNull();
            
            jayElement.update({
                name: 'Outer',
                inner: { title: 'New Inner', value: 456 },
            });
            
            expect(jayElement.dom.querySelector('.inner')).not.toBeNull();
            expect(jayElement.dom.querySelector('.title')).toHaveTextContent('New Inner');
            expect(jayElement.dom.querySelector('.value')).toHaveTextContent('456');
        });
    });
});

