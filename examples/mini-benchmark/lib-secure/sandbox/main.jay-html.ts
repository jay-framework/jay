import {HTMLElementProxy, JayElement, RenderElement} from 'jay-runtime';
import {
    sandboxElement as e,
    sandboxCondition as c,
    sandboxChildComp as childComp, SecureReferencesManager,
} from 'jay-secure';
import { BasicComponentType } from '../main/basic/basic-data-refs';
import { Basic } from './basic/basic-data';
import { CollectionsComponentType } from '../main/collections/collections-data-refs';
import { Collections } from './collections/collections-data';
import { CompositeComponentType } from '../main/composite/composite-data-refs';
import { Composite } from './composite/composite-data';
import { ConditionsComponentType } from '../main/conditions/conditions-data-refs';
import { Conditions } from './conditions/conditions-data';
import { TableHostComponentType } from '../main/table/table-host-refs';
import { TableHost } from './table/table-host';
import { elementBridge } from 'jay-secure';

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
export type MainElementRender = RenderElement<MainViewState, MainElementRefs, MainElement>
export type MainElementPreRender = [refs: MainElementRefs, MainElementRender]

export function render(): MainElementPreRender {
    const [refManager, [refChooseExample, refCycles, refRun, refBasic, refCollections, refComposite, refConditions, refTable]] =
        SecureReferencesManager.forElement(['chooseExample', 'cycles', 'run'], [], ['basic', 'collections', 'composite', 'conditions', 'table'], []);
    const render = (viewState: MainViewState) =>  elementBridge(viewState, refManager, () => [
        e(refChooseExample()),
        e(refCycles()),
        e(refRun()),
        c(
            (vs) => vs.selectedExample === SelectedExample.basic,
            [childComp(Basic, (vs) => ({ cycles: vs.cycles }), refBasic())],
        ),
        c(
            (vs) => vs.selectedExample === SelectedExample.collections,
            [childComp(Collections, (vs) => ({ cycles: vs.cycles }), refCollections())],
        ),
        c(
            (vs) => vs.selectedExample === SelectedExample.composite,
            [childComp(Composite, (vs) => ({ cycles: vs.cycles }), refComposite())],
        ),
        c(
            (vs) => vs.selectedExample === SelectedExample.conditions,
            [childComp(Conditions, (vs) => ({ cycles: vs.cycles }), refConditions())],
        ),
        c(
            (vs) => vs.selectedExample === SelectedExample.table,
            [childComp(TableHost, (vs) => ({ cycles: vs.cycles }), refTable())],
        ),
    ]) as MainElement;
    return [refManager.getPublicAPI() as MainElementRefs, render]
}
