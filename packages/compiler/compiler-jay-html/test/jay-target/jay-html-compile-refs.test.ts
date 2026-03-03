import { renderRefsType } from '../../lib';
import {
    JayComponentType,
    JayHTMLType,
    JayUnionType,
    GenerateTarget,
    Ref,
    ImportsFor,
    JayObjectType,
    mkRefsTree,
    mkRef,
} from '@jay-framework/compiler-shared';
import { prettify } from '@jay-framework/compiler-shared';

describe('renderRefsType', () => {
    it('should render empty refs interface', async () => {
        const refs = mkRefsTree([], {});
        const { imports, renderedRefs } = renderRefsType(refs, 'TestRefs', GenerateTarget.jay);
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(await prettify(''));
        expect(await prettify(renderedRefs)).toBe(await prettify('export interface TestRefs {}'));
    });

    it('should render HTMLElementProxy refs', async () => {
        const refs: Ref[] = [
            mkRef(
                'input',
                'input',
                '',
                false,
                false,
                new JayObjectType('TestViewState', {}),
                new JayHTMLType('HTMLInputElement'),
            ),
        ];

        const { imports, renderedRefs } = renderRefsType(
            mkRefsTree(refs, {}),
            'TestRefs',
            GenerateTarget.jay,
        );
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify('import { HTMLElementProxy } from "@jay-framework/runtime";'),
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
            mkRef(
                'inputs',
                'input',
                '',
                true,
                false,
                new JayObjectType('TestViewState', {}),
                new JayHTMLType('HTMLInputElement'),
            ),
        ];

        const { imports, renderedRefs } = renderRefsType(
            mkRefsTree(refs, {}),
            'TestRefs',
            GenerateTarget.jay,
        );
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify('import { HTMLElementCollectionProxy } from "@jay-framework/runtime";'),
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
            mkRef(
                'counter',
                'counter',
                '',
                false,
                false,
                new JayObjectType('TestViewState', {}),
                new JayComponentType('Counter', []),
            ),
        ];

        const { imports, renderedRefs } = renderRefsType(
            mkRefsTree(refs, {}),
            'TestRefs',
            GenerateTarget.jay,
        );
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify('import { MapEventEmitterViewState } from "@jay-framework/runtime";'),
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
            mkRef(
                'counters',
                'counters',
                '',
                true,
                false,
                new JayObjectType('TestViewState', {}),
                new JayComponentType('Counter', []),
            ),
        ];

        const { imports, renderedRefs } = renderRefsType(
            mkRefsTree(refs, {}),
            'TestRefs',
            GenerateTarget.jay,
        );
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify(
                'import { MapEventEmitterViewState, OnlyEventEmitters, ComponentCollectionProxy } from "@jay-framework/runtime";',
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
            mkRef(
                'input',
                'input',
                '',
                false,
                false,
                new JayObjectType('TestViewState', {}),
                new JayHTMLType('HTMLInputElement'),
            ),
            mkRef(
                'counter',
                'counter',
                '',
                false,
                false,
                new JayObjectType('TestViewState', {}),
                new JayComponentType('Counter', []),
            ),
        ];

        const { imports, renderedRefs } = renderRefsType(
            mkRefsTree(refs, {}),
            'TestRefs',
            GenerateTarget.jay,
        );
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify(
                'import { HTMLElementProxy, MapEventEmitterViewState } from "@jay-framework/runtime";',
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
            mkRef(
                'counter',
                'counter',
                '',
                false,
                false,
                new JayObjectType('TestViewState', {}),
                new JayComponentType('Counter', []),
            ),
        ];

        const { imports, renderedRefs } = renderRefsType(
            mkRefsTree(refs, {}),
            'TestRefs',
            GenerateTarget.react,
        );
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify('import { MapEventEmitterViewState } from "@jay-framework/runtime";'),
        );
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, any>;
            export interface TestRefs {
              counter: CounterRef<TestViewState>
            }`),
        );
    });

    it('should render component collection refs with union element type', async () => {
        const refs: Ref[] = [
            mkRef(
                '0',
                '0',
                '',
                true,
                false,
                new JayObjectType('ItemViewState', {}),
                new JayUnionType([
                    new JayComponentType('_HeadlessWidget0', []),
                    new JayComponentType('_HeadlessWidget1', []),
                    new JayComponentType('_HeadlessWidget2', []),
                ]),
            ),
        ];

        const { imports, renderedRefs } = renderRefsType(
            mkRefsTree(refs, {}),
            'TestRefs',
            GenerateTarget.jay,
        );
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(
            await prettify(
                'import { MapEventEmitterViewState, OnlyEventEmitters, ComponentCollectionProxy } from "@jay-framework/runtime";',
            ),
        );
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export type _HeadlessWidget0Ref<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof _HeadlessWidget0>>;
            export type _HeadlessWidget0Refs<ParentVS> =
                ComponentCollectionProxy<ParentVS, _HeadlessWidget0Ref<ParentVS>> &
                OnlyEventEmitters<_HeadlessWidget0Ref<ParentVS>>

            export type _HeadlessWidget1Ref<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof _HeadlessWidget1>>;
            export type _HeadlessWidget1Refs<ParentVS> =
                ComponentCollectionProxy<ParentVS, _HeadlessWidget1Ref<ParentVS>> &
                OnlyEventEmitters<_HeadlessWidget1Ref<ParentVS>>

            export type _HeadlessWidget2Ref<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof _HeadlessWidget2>>;
            export type _HeadlessWidget2Refs<ParentVS> =
                ComponentCollectionProxy<ParentVS, _HeadlessWidget2Ref<ParentVS>> &
                OnlyEventEmitters<_HeadlessWidget2Ref<ParentVS>>

            export interface TestRefs {
              0: _HeadlessWidget0Refs<ItemViewState> | _HeadlessWidget1Refs<ItemViewState> | _HeadlessWidget2Refs<ItemViewState>
            }`),
        );
    });

    it('should render linked contract refs as refs sub property with the contract refs type', async () => {
        const refsTree = mkRefsTree([], {
            subContract: mkRefsTree([], {}, false, 'SubContractRefs', 'SubContractRepeatedRefs'),
        });

        const { imports, renderedRefs } = renderRefsType(refsTree, 'TestRefs');
        expect(await prettify(imports.render(ImportsFor.definition))).toBe(await prettify(''));
        expect(await prettify(renderedRefs)).toBe(
            await prettify(`
            export interface TestRefs {
              subContract: SubContractRefs
            }`),
        );
    });

    it('should render linked contract refs for dynamic ref as refs sub property with the contract repeatedRefs type', async () => {
        const refsTree = mkRefsTree([], {
            prop: mkRefsTree([], {
                subContract: mkRefsTree([], {}, true, 'SubContractRefs', 'SubContractRepeatedRefs'),
            }),
        });

        const { imports, renderedRefs } = renderRefsType(refsTree, 'TestRefs');
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
