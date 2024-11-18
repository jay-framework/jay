## JayElement

> note: this is an "how it works doc"

The `jay-compiler` compiles `jay-html` into `JayElement<ViewState, Refs>` implementation code files, discussed here.

Taking the example from the [readme.md](../readme.md), the `jay-html` is 

```html
<html>
  <head>
    <script type="application/yaml-jay">
      data:
        count: number
    </script>
  </head>
  <body>
    <div>
      <button ref="subtracter">-</button>
      <span style="margin: 0 16px">{count}</span>
      <button ref="adder-button">+</button>
    </div>
  </body>
</html>
```

and the generated jay element is
```typescript
import {JayElement, element as e, dynamicText as dt, RenderElement, ReferencesManager, ConstructContext, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

export interface CounterViewState {
  count: number
}

export interface CounterElementRefs {
  subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>,
  adderButton: HTMLElementProxy<CounterViewState, HTMLButtonElement>
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>
export type CounterElementRender = RenderElement<CounterViewState, CounterElementRefs, CounterElement>
export type CounterElementPreRender = [CounterElementRefs, CounterElementRender]


export function render(options?: RenderElementOptions): CounterElementPreRender {
    const [refManager, [refSubtracter, refAdderButton]] =
        ReferencesManager.for(options, ['subtracter', 'adderButton'], [], [], []);
    const render = (viewState: CounterViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => e('div', {}, [
      e('button', {}, ['-'], refSubtracter()),
      e('span', {style: {cssText: 'margin: 0 16px'}}, [dt(vs => vs.count)]),
      e('button', {}, ['+'], refAdderButton())
    ])
    ) as CounterElement;
    return [refManager.getPublicAPI() as CounterElementRefs, render];
}
```

The generated file can use any of set of jay element creation functions - `element`, `dynamicElement`, `dynamicText`, 
`dynamicAttribute`, `dynamicProperty`, `childComp`, `forEach`, `conditional`. 

* See the [Runtime Implementation](./runtime.md) for the details of the jay-element constructor functions.
