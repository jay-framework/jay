Jay Runtime
===


The Jay Runtime library is an efficient dom manipulation library, built to be the output of code generation (compiler). 
The runtime basic building block is the `JayElement<T>` which is an instance 
returned from the `element` and `dynamicElement functions. 
                                                                         
## JayElement

The `JayElement<T>` instance manages the dom structure, including initial dom creation, 
updates to the dom and event handling.

The `JayElement<T>` is defined as
```typescript
export interface JayElement<T> {
    dom: HTMLElement;
    update: updateFunc<T>;
    mount: mountFunc;
    unmount: mountFunc;
}
```

## building JayElements

The runtime library provides a number of constructor functions used to create JayElements. 
A Typical JayElement takes the form of 

```typescript
import {element as e, dynamicText as dt, ConstructContext} from '../../lib/element';

interface ViewState {
    text: string
    text2: string
}

export default function render(viewState: ViewState) {
    return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
        e('div', {}, [
            e('div', {}, [dt(context, vs => vs.text)]),
            e('div', {}, ['static']),
            e('div', {}, [dt(context, vs => vs.text2)])
        ])
    )
}
```

**Note:** this code is not intended to be written by hand - it is intended to be the compiler output.
In this section we discuss how this code works

The building blocks are 

* [element()](#element)
* [Static Text Content](#text)
* [Static Attribute Values](#attribute)
* [dynamicElement()](#dynamicElement)
* [dynamicText()](#dynamicText)
* [dynamicAttribute()](#dynamicAttribute)
* [forEach()](#forEach)
* [conditional()](#conditional)
* [ConstructionContext](#ConstructionContext)

### <a name="element">element</a>

The `element` function creates a simple 'static' element - element who has a fixed number of dom children. 
The static element itself can have dynamic attributes or inner text. 
To create dynamic number of dom children use `dynamicElement` discussed below.

The `element` function signature is 
```typescript
declare function element<T, A extends Array<any>>(
    tagName: string, 
    attributes: Attributes<T>, 
    children?: Array<JayElement<T> | TextElement<T> | string>, 
    context?: ConstructContext<A>
): JayElement<T>;
```

at which
* `T` - is the type of the current view state, used as input to the update function for this element
* `A` - is an array type of all the view states, including the current one and all parent view states (see forEach) 
* `tagName` - the name of the HTML tag, like `div` or `button`
* `attributes` - an object who's keys are attribute names, and values are static attributes values (strings) or 
  dynamic attributes `DynamicAttribute<T>`
* `children` - the children of the element - can be more elements, static text (string) or dynamic text (TextElement<T>)
* `context` - used to construct the element, holding the current data context as well as the facilities to create events.

### <a name="text">Static Text Content</a>

Static text content is supported as a string constant that is passed as a member of the `children` parameter of the 
`element` or `dynamicElement` functions.

A simple example

```typescript
e('div', {}, ['some static text'])
```

### <a name="attribute">Static Attribute Value</a>

Static attribute values are supported as a string constant that is passed as a member of the `attributes` parameter of the
`element` or `dynamicElement` functions.

A simple example

```typescript
e('div', {
  "data-attribute": "some static value",
  "class": "class1  class2",
  "style": {
    "border": "1px solid red",
    "border-radius": "5px"
  }
}, [])
```

### <a name="dynamicElement">dynamicElement</a>

Dynamic element is a constructor for an element that supports dynamic adding and removing 
children. Internally, it is using a [Kindergarten](kindergarten.md) to manage 
groups of childrens.

The signature of dynamic element is 

```typescript
declare function dynamicElement<T, A extends Array<any>>(
    tagName: string, 
    attributes: Attributes<T>, 
    children?: Array<Conditional<T> | ForEach<T, any> | TextElement<T> | JayElement<T> | string>, 
    context?: ConstructContext<A>
): JayElement<T>;
```

at which
* `T` - is the type of the current view state, used as input to the update function for this element
* `A` - is an array type of all the view states, including the current one and all parent view states (see forEach)
* `tagName` - the name of the HTML tag, like `div` or `button`
* `attributes` - an object who's keys are attribute names, and values are static attributes values (strings) or
  dynamic attributes `DynamicAttribute<T>`
* `children` - the children of the element - can be any of
  * `Conditional` - for supporting conditional children, using the `if` directive in the jay file
  * `ForEach` - for supporting collection children, using the `forEach` directive in the jay file  
  * `elements` - for child elements, who can be dynamic, but the element inclusion itself is static
  * static text (string)
  * dynamic text (TextElement<T>)
* `context` - used to construct the element, holding the current data context as well as the facilities to create events.


### <a name="dynamicText">dynamicText</a>

Dynamic Text creates a text element that is dynamic and can be updated as data changes. 

Dynamic text looks like

```typescript
dt(context, vs => vs.text)
dt(context, vs => `${vs.firstName} ${vs.lastName}`)
```

The signature of dynamic text is

```typescript
declare function dynamicText<T, A extends Array<any>>(
    context: ConstructContext<A>, 
    textContent: (T: any) => string
): TextElement<T>;
```

at which
* `context` - used to construct the element, holding the current data context as well as the facilities to create events.
* `textContent` - a function that renders the text from the current data item

### <a name="dynamicAttribute">dynamicAttribute</a>
            
Dynamic Attribute creates an attribute whos value updates as the data changes.

Dynamic Attribute looks like

```typescript
{className: da(context.currData, vs => `${vs.bool1?'main':'second'}`)}
```

The signature of dynamic attribute is

```typescript
declare function dynamicAttribute<T, S>(
    initialData: T, 
    attributeValue: (data: T) => string
): DynamicAttribute<T>;
```

at which
* `initialData` - used to construct the element with the current data.
* `textContent` - a function that renders the attribute value from the current data item

### <a name="forEach">forEach</a>

```typescript
declare function forEach<T, Item>(
    getItems: (T: any) => Array<Item>, 
    elemCreator: (Item: any) => JayElement<Item>, 
    matchBy: string
): ForEach<T, Item>;
```
### <a name="conditional">conditional</a>

```typescript
declare function conditional<T>(
    condition: (newData: T) => boolean, 
    elem: JayElement<T> | TextElement<T> | string
): Conditional<T>;
```

### <a name="ConstructionContext">ConstructionContext</a>

```typescript
declare class ConstructContext<A extends Array<any>> {
    refManager: ReferencesManager;
    data: A;
    forStaticElements: boolean;
    constructor(data: A, dm?: ReferencesManager, forStaticElements?: boolean);
    get currData(): any;
    static acc<A extends Array<any>, B>(a: A, b: B): [...A, B];
    forItem<T>(t: T): ConstructContext<[...A, T]>;
    static root<T>(t: T): ConstructContext<[T]>;
    static withRootContext<T, A extends ConstructContext<[T]>>(
        t: T, 
        elementConstructor: (A: any) => JayElement<T>
    ): JayElement<T>;
}
```
