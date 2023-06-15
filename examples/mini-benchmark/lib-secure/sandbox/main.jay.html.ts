import {HTMLElementProxy, JayElement} from "jay-runtime";
import {sandboxElement as e, sandboxCondition as c, sandboxForEach as forEach, sandboxChildComp as childComp} from "jay-secure";
import {BasicRef} from '../main/basic/basic-data-refs';
import {Basic} from './basic/basic-data';
import {CollectionsRef} from '../main/collections/collections-data-refs';
import {Collections} from './collections/collections-data';
import {CompositeRef} from '../main/composite/composite-data-refs';
import {Composite} from './composite/composite-data';
import {ConditionsRef} from '../main/conditions/conditions-data-refs';
import {Conditions} from './conditions/conditions-data';
import {TableHostRef} from '../main/table/table-host-refs';
import {TableHost} from './table/table-host';
import {elementBridge} from "jay-secure";

export enum SelectedExample {
  basic,
  collections,
  composite,
  conditions,
  table
}

export interface Example {
  value: string,
  name: string
}

export interface MainViewState {
  cycles: number,
  selectedExample: SelectedExample,
  progress: string,
  examples: Array<Example>
}

export interface MainElementRefs {
  chooseExample: HTMLElementProxy<MainViewState, HTMLSelectElement>,
  cycles: HTMLElementProxy<MainViewState, HTMLInputElement>,
  run: HTMLElementProxy<MainViewState, HTMLButtonElement>,
  basic: BasicRef<MainViewState>,
  collections: CollectionsRef<MainViewState>,
  composite: CompositeRef<MainViewState>,
  conditions: ConditionsRef<MainViewState>,
  table: TableHostRef<MainViewState>
}

export type MainElement = JayElement<MainViewState, MainElementRefs>

export function render(viewState: MainViewState): MainElement {
  return elementBridge(viewState, () => [
    e('chooseExample'),
    e('cycles'),
    e('run'),
    c(vs => vs.selectedExample === SelectedExample.basic,
        [childComp(Basic, vs => ({cycles: vs.cycles}), 'basic')]
    ),
    c(vs => vs.selectedExample === SelectedExample.collections,
        [childComp(Collections, vs => ({cycles: vs.cycles}), 'collections')]
    ),
    c(vs => vs.selectedExample === SelectedExample.composite,
        [childComp(Composite, vs => ({cycles: vs.cycles}), 'composite')]
    ),
    c(vs => vs.selectedExample === SelectedExample.conditions,
        [childComp(Conditions, vs => ({cycles: vs.cycles}), 'conditions')]
    ),
    c(vs => vs.selectedExample === SelectedExample.table,
        [childComp(TableHost, vs => ({cycles: vs.cycles}), 'table')]
    )
  ])
}