import {JayElement, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {TableFixedImmerHostRef} from './table-fixed-immer/table-host-refs';
import {TableFixedImmerHost} from './table-fixed-immer/table-host';
import {TableFixedImmutableHostRef} from './table-fixed-immutable/table-host-refs';
import {TableFixedImmutableHost} from './table-fixed-immutable/table-host';
import {TableFixedMutableHostRef} from './table-fixed-mutable/table-host-refs';
import {TableFixedMutableHost} from './table-fixed-mutable/table-host';
import {TableImmerHostRef} from './table-immer/table-host-refs';
import {TableImmerHost} from './table-immer/table-host';
import {TableImmutableHostRef} from './table-immutable/table-host-refs';
import {TableImmutableHost} from './table-immutable/table-host';
import {TableMutableHostRef} from './table-mutable/table-host-refs';
import {TableMutableHost} from './table-mutable/table-host';

export enum SelectedExample {
  mutable,
  immutable,
  immer,
  fixedMutable,
  fixedImmutable,
  fixedImmer
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
  tableFixedImmer: TableFixedImmerHostRef<MainViewState>,
  tableFixedImmutable: TableFixedImmutableHostRef<MainViewState>,
  tableFixedMutable: TableFixedMutableHostRef<MainViewState>,
  tableImmer: TableImmerHostRef<MainViewState>,
  tableImmutable: TableImmutableHostRef<MainViewState>,
  tableMutable: TableMutableHostRef<MainViewState>
}

export type MainElement = JayElement<MainViewState, MainElementRefs>

export declare function render(viewState: MainViewState, options?: RenderElementOptions): MainElement