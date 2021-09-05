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


### <a name="attribute">Static Attribute Value</a>
### <a name="dynamicElement">dynamicElement</a>
### <a name="dynamicText">dynamicText</a>
### <a name="dynamicAttribute">dynamicAttribute</a>
### <a name="forEach">forEach</a>
### <a name="conditional">conditional</a>
