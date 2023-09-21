# Jay Runtime

The Jay runtime is what drives a Jay Component. A Jay file is compiled into a Jay Component with a signature of

```typescript
declare function render(viewState: ViewState): JayElement<ViewState>;
```

where

```typescript
type updateFunc<T> = (newData: T) => void;

export interface JayElement<T> {
  dom: HTMLElement;
  update: updateFunc<T>;
}
```

This document describes the inner working of the Jay Runtime that drives a Jay Component.

## Compiler Output

The Jay Compiler, given a Jay File, will generate a runtime file such as

```typescript
import {
  JayElement,
  element as e,
  dynamicText as dt,
  conditional as c,
  dynamicElement as de,
} from 'jay-runtime';

interface ViewState {
  text1: string;
  text2: string;
  cond: boolean;
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return de(
    'div',
    {},
    [
      c(
        (vs) => vs.cond,
        e('div', { style: { cssText: 'color:red' } }, [dt(viewState, (vs) => vs.text1)]),
      ),
      c(
        (vs) => !vs.cond,
        e('div', { style: { cssText: 'color:green' } }, [dt(viewState, (vs) => vs.text2)]),
      ),
    ],
    viewState,
  );
}
```

or

```typescript
import {
  JayElement,
  element as e,
  dynamicText as dt,
  dynamicElement as de,
  forEach,
} from 'jay-runtime';

interface Item {
  name: string;
  completed: boolean;
  cost: number;
  id: string;
}

interface ViewState {
  title: string;
  items: Array<Item>;
}

export function render(viewState: ViewState): JayElement<ViewState> {
  return e('div', {}, [
    e('h1', {}, [dt(viewState, (vs) => vs.title)]),
    de(
      'div',
      {},
      [
        forEach(
          (vs) => vs.items,
          (vs1: Item) => {
            return e('div', {}, [
              e(
                'span',
                { style: { cssText: 'color:green; width: 100px; display: inline-block;' } },
                [dt(vs1, (vs) => vs.name)],
              ),
              e('span', { style: { cssText: 'color:red; width: 100px; display: inline-block;' } }, [
                dt(vs1, (vs) => vs.completed),
              ]),
              e(
                'span',
                { style: { cssText: 'color:blue; width: 100px; display: inline-block;' } },
                [dt(vs1, (vs) => vs.cost)],
              ),
            ]);
          },
          'id',
        ),
      ],
      viewState,
    ),
  ]);
}
```

The compiler output is similar to React/JSX compiler output, with a few design differences -

1. The result type is not JSDom, it is a Jay Component that has both a dom element and an update function
2. The compiler resolves what is static and what is dynamic, using the different `element`, `dynamicElement`,
   `dynamicText`, 'forEach', 'conditional' functions as needed.
3. The compiler generates different accessor functions from the input data to different fields of the data
   per the instructions in the JayFile

## The main components of the Runtime

1. [Random Access Linked List](../packages/list-compare/lib/random-access-linked-list.ts) - (RAList) an implementation of a double-sided linked list with random access based on id.
1. [Kindergarden](../packages/runtime/lib/kindergarden.ts) - a wrapper for an HTML element to manage it's children.
1. [List Compare](../packages/list-compare/lib/list-compare.ts) - an algorithm to mutate one RAList into another, creating a list of instructions to apply later.
1. [element](../packages/runtime/lib/element.ts) - declares the different constructor functions such as `element`, `dynamicText`, etc.

## Random Access Linked List

Defines a bi-directional linked list with random access to items by id. The list is used in the sorting
algorithm when comparing two lists and mutating the first according to the second while extracting the
instructions how to mutate the relevant dom nodes.

The linked list items can also hold an attachment that the list ignores, but is used in the actual compare algorithm.

The signature of the linked list is

```typescript
export interface LinkedListItem<T, S> {
  id: string;
  value: T;
  attach?: S;
  next: LinkedListItem<T, S> | typeof EoF;
  prev: LinkedListItem<T, S> | typeof BoF;
}

export declare class RandomAccessLinkedList<T, S> {
  constructor(arr: Array<T>, matchBy: string);
  first(): LinkedListItem<T, S> | typeof EoF;
  last(): LinkedListItem<T, S> | typeof BoF;
  has(id: string): boolean;
  get(id: string): LinkedListItem<T, S>;
  move(itemToMove: LinkedListItem<T, S>, toBefore: LinkedListItem<T, S>);
  remove(item: LinkedListItem<T, S>);
  add(obj: T, beforeItem: LinkedListItem<T, S> | typeof EoF = EoF, attach: S = undefined);
  distance(from: LinkedListItem<T, S> | typeof EoF, to: LinkedListItem<T, S>);
  get matchBy(): string;
}
```

## Kindergarden

The Kindergarden manages the children of an HTML node in groups. The groups are ordered, and each group can be mutated
in isolation. It exposes a simple API to

1. create groups
2. add, remove and move nodes within a group
3. get the offset of a group in the children of the HTML node.

```typescript
export declare class KindergartenGroup {
  constructor(kindergarten: Kindergarten);
  ensureNode(node: Node, atIndex?: number);
  removeNode(node: Node);
  removeNodeAt(pos: number);
  moveNode(from: number, to: number);
}

export declare class Kindergarten {
  constructor(parentNode: HTMLElement);
  newGroup(): KindergartenGroup;
  getOffsetFor(group: KindergartenGroup): number;
}
```

## List Compare

This is the actual algorithm to compare two lists and extract the list of instructions
for mutating the first to the second.

the signature of the algorithm is

```typescript
export interface MatchResult<T> {
  action: typeof ITEM_ADDED | typeof ITEM_MOVED | typeof ITEM_REMOVED;
  item?: T;
  pos: number;
  fromPos?: number;
  elem?: JayElement<T>;
}

export declare function listCompare<T>(
  oldArray: RandomAccessLinkedList<T, JayElement<T>>,
  newArray: RandomAccessLinkedList<T, JayElement<T>>,
  mkElement: (T) => JayElement<T>,
): Array<MatchResult<T>>;
```

Where

1. oldArray is the initial list of items. It is mutated to match the newArray
2. newArray is the target of the mutations
3. mkElement is a function that creates a JayElement for a new item in the list
4. returns an array of mutations to apply to the dom elements, to mutate from the old state to the new state.

for example, given the list `[A, B, C, D, E]` that we need to mutate to `[A, C, D, E, B]`,
the function will return the instruction `MOVE fromPos: 1 pos:4`.

## element

The `element` function constructs a JayElement that can be dynamic, but it's direct children existance is static.
That is, the direct children of 'element`cannot be`conditinal`or`forEach`. It's signature

```typescript
type updateConstructor<T, S> = (e: HTMLElement, newData: T, state: S) => S;
export declare function element<T, S>(
  tagName: string,
  attributes: any = {},
  children: Array<JayElement<T> | TextElement<T> | string> = [],
  initialData: T = undefined,
  initialState: S = undefined,
  update: updateConstructor<T, S> = noopUpdateConstructor,
): JayElement<T>;
```

1. `tagName` - the name of the HTML tag to create
1. `attributes` - an object of attributes to apply to the HTML tag.
1. `children` - the child elements of the HTML element.
1. `initialData` - if the actual element is dynamic, this is the initial data to be rendered on JayElement creation
1. `initialState` - if the actual element is dynamic, this is the initial state that is checked against the
   value returned from the updateConsttuctor function.
1. `update` - an update function that is called when the `JayElement.update` is called. The `update` function
   gets the actual HTML element to apply updates for, the new data, and the last state from the last update, to be used
   to decide if there is need to update the HTML element

## dynamicElement

Similar to `element`, except that `dynamicElement` creates a `Kindergarten` and support dynamic childrens.

```typescript
export declare function dynamicElement<T, S>(
  tagName: string,
  attributes: any = {},
  children: Array<Conditional<T> | ForEach<T, any> | TextElement<T> | JayElement<T> | string> = [],
  initialData: T = undefined,
  initialState: S = undefined,
  update: updateConstructor<T, S> = noopUpdateConstructor,
): JayElement<T>;
```

## dynamicText

supports text nodes with dynamic content, represented as javascript template strings.

```typescript
type updateFunc<T> = (newData: T) => void;
export interface TextElement<T> {
  dom: Text;
  update: updateFunc<T>;
}

export declare function dynamicText<T>(initialData: T, textContent: (T) => string): TextElement<T>;
```

1. `initialData` - the data to render on JayElement creation.
1. `textContent` - function to generate the text content based on the provided data in the `update` function.

## conditional

creates a pseudo element that works with a Kindergarten group to control the inclusion of a JayElement in the
parent JayElement dom

```typescript
export declare function conditional<T>(
  condition: (newData: T) => boolean,
  elem: JayElement<T> | TextElement<T> | string,
): Conditional<T>;
```

## forEach

creates a pseudo element that works with a Kindergarten group to control the inclusion of a JayElements in the
parent JayElement dom, based on the number of items

```typescript
export declare function forEach<T, Item>(
  getItems: (T) => Array<Item>,
  elemCreator: (Item) => JayElement<Item>,
  matchBy: string,
): ForEach<T, Item>;
```
