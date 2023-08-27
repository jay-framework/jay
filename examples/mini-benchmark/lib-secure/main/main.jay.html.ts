import {JayElement, element as e, dynamicText as dt, dynamicProperty as dp, conditional as c, dynamicElement as de, forEach, ConstructContext, HTMLElementProxy, elemRef as er, compRef as cr, RenderElementOptions} from "jay-runtime";
import {BasicRef} from './basic/basic-data-refs';
import {Basic} from './basic/basic-data';
import {CollectionsRef} from './collections/collections-data-refs';
import {Collections} from './collections/collections-data';
import {CompositeRef} from './composite/composite-data-refs';
import {Composite} from './composite/composite-data';
import {ConditionsRef} from './conditions/conditions-data-refs';
import {Conditions} from './conditions/conditions-data';
import {TableHostRef} from './table/table-host-refs';
import {TableHost} from './table/table-host';
import {secureChildComp as childComp} from "jay-secure";

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

export function render(viewState: MainViewState, options?: RenderElementOptions): MainElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {class: 'title'}, ['Jay Benchmarks - the Jay Project']),
      e('div', {class: 'select-example'}, [
        e('label', {for: 'choose-example'}, ['Select example to view']),
        de('select', {id: 'choose-example'}, [
          forEach(vs => vs.examples, (vs1: Example) => {
            return e('option', {value: 'value'}, [dt(vs => vs.name)            ])}, 'value')
        ], er('chooseExample'))
      ]),
      e('div', {class: 'cycles'}, [
        e('label', {for: 'cycles'}, ['Select number of cycles']),
        e('input', {id: 'cycles', value: dp(vs => vs.cycles)}, [], er('cycles'))
      ]),
      e('div', {class: 'progress'}, [dt(vs => vs.progress)]),
      e('button', {}, ['run'], er('run')),
      de('div', {class: 'stage'}, [
        c(vs => vs.selectedExample === SelectedExample.basic,
          childComp(Basic, (vs: MainViewState) => ({cycles: vs.cycles}), cr('basic'))
        ),
        c(vs => vs.selectedExample === SelectedExample.collections,
          childComp(Collections, (vs: MainViewState) => ({cycles: vs.cycles}), cr('collections'))
        ),
        c(vs => vs.selectedExample === SelectedExample.composite,
          childComp(Composite, (vs: MainViewState) => ({cycles: vs.cycles}), cr('composite'))
        ),
        c(vs => vs.selectedExample === SelectedExample.conditions,
          childComp(Conditions, (vs: MainViewState) => ({cycles: vs.cycles}), cr('conditions'))
        ),
        c(vs => vs.selectedExample === SelectedExample.table,
          childComp(TableHost, (vs: MainViewState) => ({cycles: vs.cycles}), cr('table'))
        )
      ])
    ]), options);
}