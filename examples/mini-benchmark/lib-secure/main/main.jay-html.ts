import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicProperty as dp,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    ReferencesManager,
    RenderElement,
} from 'jay-runtime';
import { BasicComponentType } from './basic/basic-data-refs';
import { Basic } from './basic/basic-data';
import { CollectionsComponentType } from './collections/collections-data-refs';
import { Collections } from './collections/collections-data';
import { CompositeComponentType } from './composite/composite-data-refs';
import { Composite } from './composite/composite-data';
import { ConditionsComponentType } from './conditions/conditions-data-refs';
import { Conditions } from './conditions/conditions-data';
import { TableHostComponentType } from './table/table-host-refs';
import { TableHost } from './table/table-host';
import { secureChildComp as childComp } from 'jay-secure';

export enum SelectedExample {
    basic,
    collections,
    composite,
    conditions,
    table,
}

export interface Example {
    value: string;
    name: string;
}

export interface MainViewState {
    cycles: number;
    selectedExample: SelectedExample;
    progress: string;
    examples: Array<Example>;
}

export interface MainElementRefs {
    chooseExample: HTMLElementProxy<MainViewState, HTMLSelectElement>;
    cycles: HTMLElementProxy<MainViewState, HTMLInputElement>;
    run: HTMLElementProxy<MainViewState, HTMLButtonElement>;
    basic: BasicComponentType<MainViewState>;
    collections: CollectionsComponentType<MainViewState>;
    composite: CompositeComponentType<MainViewState>;
    conditions: ConditionsComponentType<MainViewState>;
    table: TableHostComponentType<MainViewState>;
}

export type MainElement = JayElement<MainViewState, MainElementRefs>;
export type MainElementRender = RenderElement<MainViewState, MainElementRefs, MainElement>;
export type MainElementPreRender = [refs: MainElementRefs, MainElementRender];

export function render(options?: RenderElementOptions): MainElementPreRender {
    const [
        refManager,
        [
            refChooseExample,
            refCycles,
            refRun,
            refBasic,
            refCollections,
            refComposite,
            refConditions,
            refTable,
        ],
    ] = ReferencesManager.for(
        options,
        ['chooseExample', 'cycles', 'run'],
        [],
        ['basic', 'collections', 'composite', 'conditions', 'table'],
        [],
    );
    const render = (viewState: MainViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', { class: 'select-example' }, [
                    e('label', { for: 'choose-example' }, ['Select example to view']),
                    de(
                        'select',
                        { id: 'choose-example' },
                        [
                            forEach(
                                (vs) => vs.examples,
                                (vs1: Example) => {
                                    return e('option', { value: 'value' }, [dt((vs) => vs.name)]);
                                },
                                'value',
                            ),
                        ],
                        refChooseExample(),
                    ),
                ]),
                e('div', { class: 'cycles' }, [
                    e('label', { for: 'cycles' }, ['Select number of cycles']),
                    e('input', { id: 'cycles', value: dp((vs) => vs.cycles) }, [], refCycles()),
                ]),
                e('div', { class: 'progress' }, [dt((vs) => vs.progress)]),
                e('button', {}, ['run'], refRun()),
                de('div', { class: 'stage' }, [
                    c(
                        (vs) => vs.selectedExample === SelectedExample.basic,
                        childComp(
                            Basic,
                            (vs: MainViewState) => ({ cycles: vs.cycles }),
                            refBasic(),
                        ),
                    ),
                    c(
                        (vs) => vs.selectedExample === SelectedExample.collections,
                        childComp(
                            Collections,
                            (vs: MainViewState) => ({ cycles: vs.cycles }),
                            refCollections(),
                        ),
                    ),
                    c(
                        (vs) => vs.selectedExample === SelectedExample.composite,
                        childComp(
                            Composite,
                            (vs: MainViewState) => ({ cycles: vs.cycles }),
                            refComposite(),
                        ),
                    ),
                    c(
                        (vs) => vs.selectedExample === SelectedExample.conditions,
                        childComp(
                            Conditions,
                            (vs: MainViewState) => ({ cycles: vs.cycles }),
                            refConditions(),
                        ),
                    ),
                    c(
                        (vs) => vs.selectedExample === SelectedExample.table,
                        childComp(
                            TableHost,
                            (vs: MainViewState) => ({ cycles: vs.cycles }),
                            refTable(),
                        ),
                    ),
                ]),
            ]),
        ) as MainElement;
    return [refManager.getPublicAPI() as MainElementRefs, render];
}
