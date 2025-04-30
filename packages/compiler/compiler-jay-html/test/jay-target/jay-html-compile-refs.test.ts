import { renderRefsType } from '../../lib';
import {
    JayComponentType,
    JayHTMLType,
    GenerateTarget,
    Ref,
    ImportsFor,
    JayObjectType,
    JayImportedContract,
} from 'jay-compiler-shared';
import { prettify } from 'jay-compiler-shared';

describe('renderRefsType', () => {
    it('should render empty refs interface', async () => {
        const refs: Ref[] = [];
        const { imports, renderedRefs } = renderRefsType(refs, 'TestRefs', GenerateTarget.jay);
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(await prettify(''));
        expect(await prettify(renderedRefs)).toBe(await prettify('export interface TestRefs {}'));
    });

    it('should render HTMLElementProxy refs', async () => {
        const refs: Ref[] = [
            {
                ref: 'input',
                path: [],
                constName: '',
                dynamicRef: false,
                autoRef: false,
                viewStateType: new JayObjectType('TestViewState', {}),
                elementType: new JayHTMLType('HTMLInputElement'),
            },
        ];

        const { imports, renderedRefs } = renderRefsType(refs, 'TestRefs', GenerateTarget.jay);
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify('import { HTMLElementProxy } from "jay-runtime";'),
        );
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export interface TestRefs {
              input: HTMLElementProxy<TestViewState, HTMLInputElement>
            }`),
        );
    });

    it('should render HTMLElementCollectionProxy refs', async () => {
        const refs: Ref[] = [
            {
                ref: 'inputs',
                path: [],
                constName: '',
                dynamicRef: true,
                autoRef: false,
                viewStateType: new JayObjectType('TestViewState', {}),
                elementType: new JayHTMLType('HTMLInputElement'),
            },
        ];

        const { imports, renderedRefs } = renderRefsType(refs, 'TestRefs', GenerateTarget.jay);
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify('import { HTMLElementCollectionProxy } from "jay-runtime";'),
        );
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export interface TestRefs {
              inputs: HTMLElementCollectionProxy<TestViewState, HTMLInputElement>
            }`),
        );
    });

    it('should render component refs', async () => {
        const refs: Ref[] = [
            {
                ref: 'counter',
                path: [],
                constName: '',
                dynamicRef: false,
                autoRef: false,
                viewStateType: new JayObjectType('TestViewState', {}),
                elementType: new JayComponentType('Counter', []),
            },
        ];

        const { imports, renderedRefs } = renderRefsType(refs, 'TestRefs', GenerateTarget.jay);
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify('import { MapEventEmitterViewState } from "jay-runtime";'),
        );
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
            export interface TestRefs {
              counter: CounterRef<TestViewState>
            }`),
        );
    });

    it('should render component collection refs', async () => {
        const refs: Ref[] = [
            {
                ref: 'counters',
                path: [],
                constName: '',
                dynamicRef: true,
                autoRef: false,
                viewStateType: new JayObjectType('TestViewState', {}),
                elementType: new JayComponentType('Counter', []),
            },
        ];

        const { imports, renderedRefs } = renderRefsType(refs, 'TestRefs', GenerateTarget.jay);
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify(
                'import { MapEventEmitterViewState, OnlyEventEmitters, ComponentCollectionProxy } from "jay-runtime";',
            ),
        );
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
            export type CounterRefs<ParentVS> =
                ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
                OnlyEventEmitters<CounterRef<ParentVS>>
            
            export interface TestRefs {
              counters: CounterRefs<TestViewState>
            }`),
        );
    });

    it('should render mixed refs', async () => {
        const refs: Ref[] = [
            {
                ref: 'input',
                path: [],
                constName: '',
                dynamicRef: false,
                autoRef: false,
                viewStateType: new JayObjectType('TestViewState', {}),
                elementType: new JayHTMLType('HTMLInputElement'),
            },
            {
                ref: 'counter',
                path: [],
                constName: '',
                dynamicRef: false,
                autoRef: false,
                viewStateType: new JayObjectType('TestViewState', {}),
                elementType: new JayComponentType('Counter', []),
            },
        ];

        const { imports, renderedRefs } = renderRefsType(refs, 'TestRefs', GenerateTarget.jay);
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify(
                'import { HTMLElementProxy, MapEventEmitterViewState } from "jay-runtime";',
            ),
        );
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
            export interface TestRefs {
              input: HTMLElementProxy<TestViewState, HTMLInputElement>,
              counter: CounterRef<TestViewState>
            }`),
        );
    });

    it('should render component refs for react target', async () => {
        const refs: Ref[] = [
            {
                ref: 'counter',
                path: [],
                constName: '',
                dynamicRef: false,
                autoRef: false,
                viewStateType: new JayObjectType('TestViewState', {}),
                elementType: new JayComponentType('Counter', []),
            },
        ];

        const { imports, renderedRefs } = renderRefsType(refs, 'TestRefs', GenerateTarget.react);
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify('import { MapEventEmitterViewState } from "jay-runtime";'),
        );
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, any>;
            export interface TestRefs {
              counter: CounterRef<TestViewState>
            }`),
        );
    });

    it('should render linked contract refs as refs sub property with the contract refs type', async () => {
        const refs: Ref[] = [
            {
                ref: 'subContract',
                path: [],
                constName: '',
                dynamicRef: false,
                autoRef: false,
                viewStateType: new JayObjectType('TestViewState', {}),
                elementType: new JayImportedContract(
                    'SubContract',
                    'SubContractViewState',
                    'SubContractRefs',
                    'SubContractRepeatedRefs',
                ),
            },
        ];

        const { imports, renderedRefs } = renderRefsType(refs, 'TestRefs');
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(await prettify(''));
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export interface TestRefs {
              subContract: SubContractRefs
            }`),
        );
    });

    it('should render linked contract refs for dynamic ref as refs sub property with the contract repeatedRefs type', async () => {
        const refs: Ref[] = [
            {
                ref: 'subContract',
                path: ['prop'],
                constName: '',
                dynamicRef: true,
                autoRef: false,
                viewStateType: new JayObjectType('TestViewState', {}),
                elementType: new JayImportedContract(
                    'SubContract',
                    'SubContractViewState',
                    'SubContractRefs',
                    'SubContractRepeatedRefs',
                ),
            },
        ];

        const { imports, renderedRefs } = renderRefsType(refs, 'TestRefs');
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(await prettify(''));
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export interface TestRefs {
              prop: {
                subContract: SubContractRepeatedRefs
              }  
            }`),
        );
    });
});
