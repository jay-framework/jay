import {
    ConstructContext,
    JayElement,
    dynamicText as dt,
    dynamicElement as de,
    element as e,
    forEach,
    HTMLElementProxy,
    RenderElementOptions,
    withContext,
    ReferencesManager,
    RenderElement,
} from '@jay-framework/runtime';
import {
    COMPONENT_CONTEXT,
    ComponentContext,
    createDerivedArray,
    createEffect,
    createEvent,
    createMemo,
    createPatchableSignal,
    createSignal,
    forTesting,
    makeJayComponent,
    Props,
    useReactive,
} from '../lib/';
import { MeasureOfChange, Reactive } from '@jay-framework/reactive';
import { REPLACE } from '@jay-framework/json-patch';
const { makePropsProxy } = forTesting;

describe('state management', () => {
    describe('Props', () => {
        const contextTestDefaults: Omit<ComponentContext, 'reactive' | 'mountedSignal'> = {
            provideContexts: [],
            getComponentInstance: () => null,
        };
        it('should transform an object into a getters object', () => {
            const reactive = new Reactive();
            const mountedSignal = reactive.createSignal(true);
            const props = {
                name: 'abc',
                age: 12,
            };
            let propsGetters = withContext(
                COMPONENT_CONTEXT,
                { reactive, mountedSignal, ...contextTestDefaults },
                () => makePropsProxy(reactive, props),
            );

            expect(propsGetters.name()).toBe('abc');
            expect(propsGetters.age()).toBe(12);
        });

        it('should update values when given new props', () => {
            const reactive = new Reactive();
            const mountedSignal = reactive.createSignal(true);
            const props = {
                name: 'abc',
                age: 12,
            };
            let updatableProps = withContext(
                COMPONENT_CONTEXT,
                { reactive, mountedSignal, ...contextTestDefaults },
                () => makePropsProxy(reactive, props),
            );

            updatableProps.name();
            updatableProps.age();

            updatableProps.update({ name: 'def', age: 12 });

            expect(props.name).toBe('abc'); // should not update the original props object
            expect(updatableProps.name()).toBe('def');
            expect(updatableProps.age()).toBe(12);
        });

        it('should give back the props using the .props property', () => {
            const reactive = new Reactive();
            const mountedSignal = reactive.createSignal(true);
            const props = {
                name: 'abc',
                age: 12,
            };
            let propsGetters = withContext(
                COMPONENT_CONTEXT,
                { reactive, mountedSignal, ...contextTestDefaults },
                () => makePropsProxy(reactive, props),
            );

            expect(propsGetters.props()).toEqual(props);
        });

        it('should give back the updated props using the .props property', () => {
            const reactive = new Reactive();
            const mountedSignal = reactive.createSignal(true);
            const props = {
                name: 'abc',
                age: 12,
            };
            let propsGetters = withContext(
                COMPONENT_CONTEXT,
                { reactive, mountedSignal, ...contextTestDefaults },
                () => makePropsProxy(reactive, props),
            );

            propsGetters.name();
            propsGetters.age();

            propsGetters.update({ name: 'def', age: 12 });

            expect(propsGetters.props()).toEqual({
                name: 'def',
                age: 12,
            });
        });
    });

    describe('make component', () => {
        interface ViewState {
            label: string;
        }

        interface LabelRefs {
            label: HTMLElementProxy<ViewState, HTMLElement>;
        }
        interface LabelElement extends JayElement<ViewState, LabelRefs> {}
        type LabelElementRender = RenderElement<
            ViewState,
            LabelRefs,
            JayElement<ViewState, LabelRefs>
        >;
        type LabelElementPreRender = [LabelRefs, LabelElementRender];

        function renderLabelElement(): LabelElementPreRender {
            const [refManager, [labelRef]] = ReferencesManager.for({}, ['label'], [], [], []);
            const render = (viewState: ViewState) =>
                ConstructContext.withRootContext(viewState, refManager, () => {
                    return e('div', {}, [e('div', {}, [dt((vs) => vs.label)], labelRef())]);
                }) as LabelElement;
            return [refManager.getPublicAPI() as LabelRefs, render];
        }

        interface TwoLabelsViewState {
            label1: string;
            label2: string;
        }

        interface TwoLabelRefs {
            label1: HTMLElementProxy<TwoLabelsViewState, HTMLElement>;
            label2: HTMLElementProxy<TwoLabelsViewState, HTMLElement>;
        }
        interface TwoLabelsElement extends JayElement<TwoLabelsViewState, TwoLabelRefs> {}
        type TwoLabelsElementRender = RenderElement<
            TwoLabelsViewState,
            TwoLabelRefs,
            JayElement<TwoLabelsViewState, TwoLabelRefs>
        >;
        type TwoLabelsElementPreRender = [TwoLabelRefs, TwoLabelsElementRender];

        function renderTwoLabelElement(): TwoLabelsElementPreRender {
            const [refManager, [label1Ref, label2Ref]] = ReferencesManager.for(
                {},
                ['label1', 'label2'],
                [],
                [],
                [],
            );
            const render = (viewState: TwoLabelsViewState) =>
                ConstructContext.withRootContext(viewState, refManager, () => {
                    return e('div', {}, [
                        e('div', {}, [dt((vs) => vs.label1)], label1Ref()),
                        e('div', {}, [dt((vs) => vs.label2)], label2Ref()),
                    ]);
                }) as TwoLabelsElement;
            return [refManager.getPublicAPI() as TwoLabelRefs, render];
        }

        describe('with props', () => {
            interface Name {
                name: string;
            }

            function LabelComponent({ name }: Props<Name>, refs: LabelRefs) {
                return {
                    render: () => ({
                        label: name(),
                    }),
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponent);

            it('should render the component', async () => {
                let instance = label({ name: 'hello world' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello world'),
                );
            });

            it('should update the component on prop changes', async () => {
                let instance = label({ name: 'hello world' });
                instance.update({ name: 'updated world' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('updated world'),
                );
            });
        });

        describe('with state', () => {
            interface Name {
                name: string;
            }

            function LabelComponentWithInternalState(props: Props<Name>, refs: LabelRefs) {
                let [label, setLabel] = createSignal('Hello ' + props.name());

                return {
                    render: () => ({
                        label: label(),
                    }),
                    setLabel,
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState);

            it('should render the component using state', async () => {
                let instance = label({ name: 'world' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello world'),
                );
            });

            it('should update the component as state changes', async () => {
                let instance = label({ name: 'world' });
                instance.setLabel('hello mars');
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello mars'),
                );
            });

            it('should not update the component from prop change as the prop is not bound to state', async () => {
                let instance = label({ name: 'world' });
                instance.update({ name: 'mars' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello world'),
                );
            });
        });

        describe('with patchable state', () => {
            interface Name {
                name: string;
            }

            function LabelComponentWithInternalState(props: Props<Name>, refs: LabelRefs) {
                let [data, setData, patchData] = createPatchableSignal({
                    label: 'Hello ' + props.name(),
                });

                return {
                    render: () => ({
                        label: data().label,
                    }),
                    patchData,
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState);

            it('should update the component as data is patched', async () => {
                let instance = label({ name: 'world' });
                instance.patchData({ op: REPLACE, path: ['label'], value: 'hello mars' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello mars'),
                );
            });
        });

        describe('with state bound to prop', () => {
            interface Name {
                name: string;
            }

            function LabelComponentWithInternalState(props: Props<Name>, refs: LabelRefs) {
                let [label, setLabel] = createSignal(() => 'Hello ' + props.name());

                return {
                    render: () => ({
                        label: label(),
                    }),
                    setLabel,
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState);

            it('should render the component using state', async () => {
                let instance = label({ name: 'world' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello world'),
                );
            });

            it('should update the component as state changes', async () => {
                let instance = label({ name: 'world' });
                instance.setLabel('hello mars');
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello mars'),
                );
            });

            it('should not update the component from prop change as the prop is not bound to state', async () => {
                let instance = label({ name: 'world' });
                instance.update({ name: 'mars' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello mars'),
                );
            });
        });

        describe('with render view state as getters', () => {
            interface Name {
                firstName: string;
                lastName: string;
            }

            function LabelComponentWithInternalState(
                { firstName, lastName }: Props<Name>,
                refs: LabelRefs,
            ) {
                let [label, setLabel] = createSignal(
                    () => 'Hello ' + firstName() + ' ' + lastName(),
                );

                return {
                    render: () => ({
                        label,
                    }),
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithInternalState);

            it('should render initial component using a getter', async () => {
                let instance = label({ firstName: 'John', lastName: 'Smith' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello John Smith'),
                );
            });

            it('should render updated component using a getter', async () => {
                let instance = label({ firstName: 'John', lastName: 'Smith' });
                instance.update({ firstName: 'John', lastName: 'Adams' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('Hello John Adams'),
                );
            });
        });

        describe('with create effect', () => {
            interface Name {
                name: string;
            }

            function LabelComponentWithCreateEffect({ name }: Props<Name>, refs: LabelRefs) {
                let [label, setLabel] = createSignal('');
                let resourceAllocated = false;
                let effectRunCount = 0;
                let effectCleanupRunCount = 0;
                createEffect(() => {
                    setLabel('hello ' + name());
                    resourceAllocated = true;
                    effectRunCount += 1;
                    return () => {
                        resourceAllocated = false;
                        effectCleanupRunCount += 1;
                    };
                });

                const getEffectState = () => ({
                    resourceAllocated,
                    effectRunCount,
                    effectCleanupRunCount,
                });

                return {
                    render: () => ({
                        label: label(),
                    }),
                    getResourceState: getEffectState,
                };
            }

            let label = makeJayComponent(renderLabelElement, LabelComponentWithCreateEffect);

            it('should run create effect on initial component creation', async () => {
                let instance = label({ name: 'world' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello world'),
                );
                expect(instance.getResourceState().resourceAllocated).toBe(true);
                expect(instance.getResourceState().effectRunCount).toBe(1);
                expect(instance.getResourceState().effectCleanupRunCount).toBe(0);
            });

            it('should not rerun the effect if component mount is called while the component is mounted', async () => {
                let instance = label({ name: 'world' });
                instance.mount();
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello world'),
                );
                expect(instance.getResourceState().resourceAllocated).toBe(true);
                expect(instance.getResourceState().effectRunCount).toBe(1);
                expect(instance.getResourceState().effectCleanupRunCount).toBe(0);
            });

            it('should run the effect cleanup and rerun effect on dependencies change', async () => {
                let instance = label({ name: 'world' });
                instance.update({ name: 'mars' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('hello mars'),
                );
                expect(instance.getResourceState().resourceAllocated).toBe(true);
                expect(instance.getResourceState().effectRunCount).toBe(2);
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1);
            });

            it('should run the effect cleanup on component unmount', () => {
                let instance = label({ name: 'world' });
                instance.unmount();
                expect(instance.getResourceState().resourceAllocated).toBe(false);
                expect(instance.getResourceState().effectRunCount).toBe(1);
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1);
            });

            it('should run rerun the effect on component re-mount', () => {
                let instance = label({ name: 'world' });
                instance.unmount();
                instance.mount();
                expect(instance.getResourceState().resourceAllocated).toBe(true);
                expect(instance.getResourceState().effectRunCount).toBe(2);
                expect(instance.getResourceState().effectCleanupRunCount).toBe(1);
            });
        });

        describe('with create memo', () => {
            interface Name {
                name: string;
                age: number;
            }

            function LabelComponentWithCreateMemo({ name, age }: Props<Name>, refs: TwoLabelRefs) {
                let memoDependsOnName = 0,
                    memoDependsOnAge = 0;
                let label1 = createMemo(() => {
                    memoDependsOnName += 1;
                    return 'hello ' + name();
                });
                let label2 = createMemo(() => {
                    memoDependsOnAge += 1;
                    return 'age ' + age();
                });
                const getMemoComputeCount = () => ({ memoDependsOnName, memoDependsOnAge });

                return {
                    render: () => ({
                        label1: label1(),
                        label2: label2(),
                    }),
                    getMemoComputeCount,
                };
            }

            let labelComponent = makeJayComponent(
                renderTwoLabelElement,
                LabelComponentWithCreateMemo,
            );

            it('should run create memo on initial render', async () => {
                let instance = labelComponent({ name: 'world', age: 12 });
                await instance.element.refs.label1.exec$((elem) =>
                    expect(elem.textContent).toBe('hello world'),
                );
                await instance.element.refs.label2.exec$((elem) =>
                    expect(elem.textContent).toBe('age 12'),
                );
                expect(instance.getMemoComputeCount().memoDependsOnName).toBe(1);
                expect(instance.getMemoComputeCount().memoDependsOnAge).toBe(1);
            });

            it('should update only the memo dependent on name on only a name change', () => {
                let instance = labelComponent({ name: 'world', age: 12 });
                instance.update({ name: 'mars', age: 12 });
                expect(instance.getMemoComputeCount().memoDependsOnName).toBe(2);
                expect(instance.getMemoComputeCount().memoDependsOnAge).toBe(1);
            });

            it('should re-render when render depends on memo', async () => {
                let instance = labelComponent({ name: 'world', age: 12 });
                instance.update({ name: 'mars', age: 13 });
                await instance.element.refs.label1.exec$((elem) =>
                    expect(elem.textContent).toBe('hello mars'),
                );
                await instance.element.refs.label2.exec$((elem) =>
                    expect(elem.textContent).toBe('age 13'),
                );
            });

            function LabelComponentWithCreateMemo2({}: Props<never>, refs: TwoLabelRefs) {
                let [state1, setState1] = createSignal('one');
                let memoDependsOnName = 0,
                    memoDependsOnAge = 0;
                let label1 = createMemo(() => {
                    memoDependsOnName += 1;
                    return 'memo1: ' + state1();
                });
                let label2 = createMemo(() => {
                    memoDependsOnAge += 1;
                    return 'memo2: ' + label1();
                });
                return {
                    render: () => ({
                        label1: label1(),
                        label2: label2(),
                    }),
                    setState1,
                };
            }
            let labelComponent2 = makeJayComponent(
                renderTwoLabelElement,
                LabelComponentWithCreateMemo2,
            );

            it('should update memo that depend on a memo', async () => {
                let instance = labelComponent2({});
                instance.setState1('two');
                await instance.element.refs.label2.exec$((elem) =>
                    expect(elem.textContent).toBe('memo2: memo1: two'),
                );
            });

            it('should run render that depend on a memo', async () => {
                let instance = labelComponent2({});
                instance.setState1('two');
                await instance.element.refs.label1.exec$((elem) =>
                    expect(elem.textContent).toBe('memo1: two'),
                );
            });
        });

        describe('with create derived array', () => {
            interface PhoneBookListing {
                name: string;
                number: string;
            }
            interface PhoneBookViewState {
                listings: Array<PhoneBookListing>;
                numberOfCallsToMap: number;
            }

            interface PhoneBookRefs {}
            interface PhoneBookElement extends JayElement<PhoneBookViewState, PhoneBookRefs> {}
            type PhoneBookElementRender = RenderElement<
                PhoneBookViewState,
                PhoneBookRefs,
                PhoneBookElement
            >;
            type PhoneBookElementPreRender = [PhoneBookRefs, PhoneBookElementRender];

            function renderPhoneBookElement(): PhoneBookElementPreRender {
                const [refManager, []] = ReferencesManager.for({}, [], [], [], []);
                const render = (viewState: PhoneBookViewState) =>
                    ConstructContext.withRootContext(viewState, refManager, () =>
                        de('div', {}, [
                            forEach(
                                (_) => _.listings,
                                (listing: PhoneBookListing) =>
                                    e('div', {}, [
                                        dt(
                                            (listing: PhoneBookListing) =>
                                                `${listing.name}: ${listing.number}, `,
                                        ),
                                    ]),
                                'name',
                            ),
                            e('div', {}, [
                                dt((vs) => `number of calls to map: ${vs.numberOfCallsToMap}`),
                            ]),
                        ]),
                    ) as PhoneBookElement;
                return [refManager.getPublicAPI() as PhoneBookRefs, render];
            }

            interface Contact {
                firstName: string;
                lastName: string;
                number: string;
            }
            interface Contacts {
                names: Array<Contact>;
                shouldUseIndex: boolean;
                shouldUseLength: boolean;
                shouldUseAnotherProp: boolean;
                anotherProp: string;
            }

            function LabelComponentWithCreateMemo(
                {
                    names,
                    shouldUseIndex,
                    shouldUseLength,
                    shouldUseAnotherProp,
                    anotherProp,
                }: Props<Contacts>,
                refs: PhoneBookRefs,
            ) {
                let [numberOfCallsToMap, setNumberOfCallsToMap] = useReactive().createSignal(
                    0,
                    MeasureOfChange.PARTIAL,
                );

                let listings = createDerivedArray(names, (contact, index, length) => {
                    setNumberOfCallsToMap((_) => _ + 1);
                    let suffix = '';
                    if (shouldUseIndex()) suffix += ' ' + index();
                    if (shouldUseLength()) suffix += ' ' + length();
                    if (shouldUseAnotherProp()) suffix += ' ' + anotherProp();

                    return {
                        name: `${contact().firstName} ${contact().lastName}`,
                        number: contact().number + suffix,
                    };
                });

                return {
                    render: () => ({
                        listings,
                        numberOfCallsToMap,
                    }),
                };
            }

            let contactBookComponent = makeJayComponent(
                renderPhoneBookElement,
                LabelComponentWithCreateMemo,
            );

            const name1 = { firstName: 'Zara', lastName: 'Quill', number: '555-1234' };
            const name2 = { firstName: 'Caden', lastName: 'Larkspur', number: '555-5678' };
            const name3 = { firstName: 'Elara', lastName: 'Stellanova', number: '555-9012' };
            const name4 = { firstName: 'Kairos', lastName: 'Nebulon', number: '555-3456' };
            const contact5 = { firstName: 'Lyra', lastName: 'Aetherion', number: '555-7890' };
            const names1: Contacts['names'] = [name1, name2, name3, name4];
            const names2: Contacts['names'] = [name1, name2, name3, contact5];
            const names3: Contacts['names'] = [name1, name2, name3, name4, contact5];
            const names4: Contacts['names'] = [name4, name1, name3, name2];

            function formatTextContent(
                names: Contacts['names'],
                numberOfCallsToMap: number,
                useIndex: boolean = false,
                useLength: boolean = false,
                anotherProp: string = '',
            ) {
                const mappedNames = names.map((contact, index) => {
                    let suffix = '';
                    if (useIndex) suffix += ' ' + index;
                    if (useLength) suffix += ' ' + names.length;
                    if (anotherProp !== '') suffix += ' ' + anotherProp;
                    return `${contact.firstName} ${contact.lastName}: ${contact.number}${suffix}, `;
                });
                return `${mappedNames.join('')}number of calls to map: ${numberOfCallsToMap}`;
            }
            function contacts(
                names: Contacts['names'],
                shouldUseIndex: boolean = false,
                shouldUseLength: boolean = false,
                anotherProp: string = '',
            ) {
                return {
                    names,
                    shouldUseIndex,
                    shouldUseLength,
                    shouldUseAnotherProp: !!anotherProp,
                    anotherProp,
                };
            }

            it('should render an array, calling map callback for each item', async () => {
                let instance = contactBookComponent(contacts(names1));
                expect(instance.element.dom.textContent).toBe(formatTextContent(names1, 4));
            });

            it('should call map callback only for replaced items', async () => {
                let instance = contactBookComponent(contacts(names1));
                instance.update(contacts(names2));
                expect(instance.element.dom.textContent).toBe(formatTextContent(names2, 5));
            });

            it('should call map callback only for new items', async () => {
                let instance = contactBookComponent(contacts(names1));
                instance.update(contacts(names3));
                expect(instance.element.dom.textContent).toBe(formatTextContent(names3, 5));
            });

            it('should not call map callback for moved items if the callback is not using the index', async () => {
                let instance = contactBookComponent(contacts(names1));
                instance.update(contacts(names4));
                expect(instance.element.dom.textContent).toBe(formatTextContent(names4, 4));
            });

            it('should call map callback for moved items if the callback is using the index', async () => {
                let instance = contactBookComponent(contacts(names1, true));
                instance.update(contacts(names4, true));
                expect(instance.element.dom.textContent).toBe(formatTextContent(names4, 7, true));
            });

            it('should call map callback for all items if the callback is using the length and length has changed', async () => {
                let instance = contactBookComponent(contacts(names1, false, true));
                instance.update(contacts(names3, false, true));
                expect(instance.element.dom.textContent).toBe(
                    formatTextContent(names3, 9, false, true),
                );
            });

            it('should call map callback for all items if the callback another prop or state that has changed', async () => {
                let instance = contactBookComponent(contacts(names1, false, false, 'one'));
                instance.update(contacts(names1, false, false, 'two'));
                expect(instance.element.dom.textContent).toBe(
                    formatTextContent(names1, 8, false, false, 'two'),
                );
            });
        });

        describe('with expose component API', () => {
            interface Name {
                name: string;
                age: number;
            }

            function LabelComponentWithAPI({ name, age }: Props<Name>, refs: TwoLabelRefs) {
                let [label1, setLabel1] = createSignal(() => `hello ${name()}`);
                let label2 = createMemo(() => {
                    return 'age ' + age();
                });

                let getLabels = () => ({ label1: label1(), label2: label2() });
                let updateLabel1 = (newName) => setLabel1(newName);

                return {
                    render: () => ({
                        label1: label1(),
                        label2: label2(),
                    }),
                    getLabels,
                    updateLabel1,
                };
            }

            let labelComponent = makeJayComponent(renderTwoLabelElement, LabelComponentWithAPI);

            it('functions that return data', () => {
                let instance = labelComponent({ name: 'world', age: 12 });
                let labels = instance.getLabels();
                expect(labels.label1).toBe('hello world');
                expect(labels.label2).toBe('age 12');
            });

            it('functions that change internal state', async () => {
                let instance = labelComponent({ name: 'world', age: 12 });
                instance.updateLabel1('new value');
                await instance.element.refs.label1.exec$((elem) =>
                    expect(elem.textContent).toBe('new value'),
                );
            });
        });

        describe('with expose component API events', () => {
            interface CounterChangeEvent {
                value: number;
            }
            interface CounterViewState {
                value: number;
            }

            interface CounterRefs {
                inc: HTMLElementProxy<CounterViewState, HTMLElement>;
                dec: HTMLElementProxy<CounterViewState, HTMLElement>;
                value: HTMLElementProxy<CounterViewState, HTMLElement>;
            }
            interface CounterElement extends JayElement<CounterViewState, CounterRefs> {}
            type CounterElementRender = RenderElement<
                CounterViewState,
                CounterRefs,
                CounterElement
            >;
            type CounterElementPreRender = [CounterRefs, CounterElementRender];

            function renderCounterElement(options?: RenderElementOptions): CounterElementPreRender {
                const [refManager, [decRef, valueRef, incRef]] = ReferencesManager.for(
                    options,
                    ['dec', 'value', 'inc'],
                    [],
                    [],
                    [],
                );
                const render = (viewState: CounterViewState) =>
                    ConstructContext.withRootContext(viewState, refManager, () => {
                        return e('div', {}, [
                            e('button', {}, ['dec'], decRef()),
                            e('div', {}, [dt((vs) => vs.value)], valueRef()),
                            e('button', {}, ['inc'], incRef()),
                        ]);
                    }) as CounterElement;
                return [refManager.getPublicAPI() as CounterRefs, render];
            }

            interface CounterProps {}

            function CounterComponent({}: Props<CounterProps>, refs: CounterRefs) {
                let [value, setValue] = createSignal(0);
                refs.inc.onclick(() => setValue(value() + 1));
                refs.dec.onclick(() => setValue(value() - 1));
                let onChange = createEvent<CounterChangeEvent>((emitter) =>
                    emitter.emit({ value: value() }),
                );
                return {
                    render: () => ({ value }),
                    onChange,
                };
            }

            let counterComponent = makeJayComponent(renderCounterElement, CounterComponent);

            it('should register events using on-event property and invoke the event', async () => {
                let instance = counterComponent({});
                const myMock = vi.fn();
                instance.onChange(myMock);
                await instance.element.refs.inc.exec$((elem) => elem.click());
                expect(myMock.mock.calls.length).toBe(1);
            });

            it('should unregister events', async () => {
                let instance = counterComponent({});
                const myMock = vi.fn();
                instance.onChange(myMock);
                instance.onChange(undefined);
                await instance.element.refs.inc.exec$((elem) => elem.click());
                expect(myMock.mock.calls.length).toBe(0);
            });
            it('should invoke event with payload', async () => {
                let instance = counterComponent({});
                const myMock = vi.fn();
                instance.onChange(myMock);
                await instance.element.refs.inc.exec$((elem) => elem.click());
                await instance.element.refs.inc.exec$((elem) => elem.click());
                expect(myMock.mock.calls.length).toBe(2);
                expect(myMock.mock.calls[0][0]).toEqual({ event: { value: 1 } });
                expect(myMock.mock.calls[1][0]).toEqual({ event: { value: 2 } });
            });

            it('should register events using addEventListener and invoke the event', async () => {
                let instance = counterComponent({});
                const myMock = vi.fn();
                instance.addEventListener('Change', myMock);
                await instance.element.refs.inc.exec$((elem) => elem.click());
                expect(myMock.mock.calls.length).toBe(1);
            });

            it('should register and remove events', async () => {
                let instance = counterComponent({});
                const myMock = vi.fn();
                instance.addEventListener('Change', myMock);
                instance.removeEventListener('Change', myMock);
                await instance.element.refs.inc.exec$((elem) => elem.click());
                expect(myMock.mock.calls.length).toBe(0);
            });
        });

        describe('performance', () => {
            interface LabelAndButtonViewState {
                label: string;
            }

            interface LabelAndButtonRefs {
                label: HTMLElementProxy<LabelAndButtonViewState, HTMLElement>;
                button: HTMLElementProxy<LabelAndButtonViewState, HTMLElement>;
            }
            interface LabelAndButtonElement
                extends JayElement<LabelAndButtonViewState, LabelAndButtonRefs> {}
            type LabelAndButtonElementRender = RenderElement<
                LabelAndButtonViewState,
                LabelAndButtonRefs,
                LabelAndButtonElement
            >;
            type LabelAndButtonElementPreRender = [LabelAndButtonRefs, LabelAndButtonElementRender];

            let renderCount = 0;

            function trackingLabelGetter(vs: LabelAndButtonViewState): string {
                renderCount += 1;
                return vs.label;
            }

            function renderTwoLabelElement(
                options?: RenderElementOptions,
            ): LabelAndButtonElementPreRender {
                const [refManager, [labelRef, buttonRef]] = ReferencesManager.for(
                    options,
                    ['label', 'button'],
                    [],
                    [],
                    [],
                );
                const render = (viewState: LabelAndButtonViewState) =>
                    ConstructContext.withRootContext(viewState, refManager, () => {
                        return e('div', {}, [
                            e('div', {}, [dt(trackingLabelGetter)], labelRef()),
                            e('button', {}, ['click'], buttonRef()),
                        ]);
                    }) as LabelAndButtonElement;
                return [refManager.getPublicAPI() as LabelAndButtonRefs, render];
            }

            beforeEach(() => {
                renderCount = 0;
            });

            interface TwoProps {
                one: string;
                two: string;
            }

            function TestComponent1({ one, two }: Props<TwoProps>, refs: LabelAndButtonRefs) {
                return {
                    render: () => ({
                        label: `${one()} ${two()}`,
                    }),
                };
            }

            const Test1 = makeJayComponent(renderTwoLabelElement, TestComponent1);

            function TestComponent2({}: Props<null>, refs: LabelAndButtonRefs) {
                let [one, setOne] = createSignal('');
                let [two, setTwo] = createSignal('');
                const setValues = (a, b) => {
                    setOne(a);
                    setTwo(b);
                };
                refs.button.onclick(() => {
                    setOne('one');
                    setTwo('two');
                });
                return {
                    render: () => ({
                        label: `${one()} ${two()}`,
                    }),
                    setValues,
                };
            }

            const Test2 = makeJayComponent(renderTwoLabelElement, TestComponent2);

            function asyncOperation(one: number, two: number): Promise<number> {
                return new Promise((resolve) => {
                    setImmediate((_) => resolve(one + two));
                });
            }

            function TestComponent3({}: Props<null>, refs: LabelAndButtonRefs) {
                let [one, setOne] = createSignal(12);
                let [two, setTwo] = createSignal(34);
                let [three, setThree] = createSignal(0);
                let reactive = useReactive();
                let [isWaiting, resolve] = mkResolvablePromise();
                refs.button.onclick(async () => {
                    let apiResult = await asyncOperation(one(), two());
                    setOne(0);
                    setTwo(0);
                    setThree(apiResult);
                    resolve();
                });
                const forAPItoFinish = () => isWaiting;
                const getReactive = () => reactive;
                return {
                    render: () => ({
                        label: `${one()} ${two()}`,
                    }),
                    forAPItoFinish,
                    getReactive,
                    three,
                };
            }

            const Test3 = makeJayComponent(renderTwoLabelElement, TestComponent3);
            const initialRenderCycles = 1;

            it('should render once static elements on first render', async () => {
                const instance = Test1({ one: 'one', two: 'two' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('one two'),
                );
                expect(renderCount).toBe(initialRenderCycles);
            });

            it('should render only once on prop update (in addition to initial renders)', async () => {
                const instance = Test1({ one: 'one', two: 'two' });
                instance.update({ one: 'three', two: 'four' });
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('three four'),
                );
                expect(renderCount).toBe(initialRenderCycles + 1);
            });

            it('should render only once on multiple state updates from an API function', async () => {
                const instance = Test2({});
                instance.setValues('one', 'two');
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('one two'),
                );
                expect(renderCount).toBe(initialRenderCycles + 1);
            });

            it('should render only once on multiple state updates from a ref event (DOM or nested component)', async () => {
                const instance = Test2({});
                await instance.element.refs.button.exec$((elem) => elem.click());
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('one two'),
                );
                expect(renderCount).toBe(initialRenderCycles + 1);
            });

            it('should render only once on async API call and multiple state updates', async () => {
                const instance = Test3({});
                // those two getters have to be called before the button click so that the component API call will not flush
                // the reactions of the state management after the API call
                const waitingForAPIToFinish = instance.forAPItoFinish();
                const reactive = instance.getReactive();
                //
                await instance.element.refs.button.exec$((elem) => elem.click());
                await waitingForAPIToFinish;
                await reactive.toBeClean();
                await instance.element.refs.label.exec$((elem) =>
                    expect(elem.textContent).toBe('0 0'),
                );
                expect(instance.three()).toBe(46);
                expect(renderCount).toBe(initialRenderCycles + 1);
            });
        });
    });
});

function mkResolvablePromise() {
    let resolve;
    let promise = new Promise((res) => (resolve = res));
    return [promise, resolve];
}
