Reference API
=====


References are used by components to reference internal `JayElements` and `JayComponents`.

The consideration with the API are 
1. Elements may be in the main window, while the component in a worker sandbox. This implies that
   we cannot have direct references to DOM elements, but we can have direct reference to components
2. internal elements and components can be single or a dynamic list

The proposed API:

Shared Declarations for Elements:
---
```typescript
export type JeyEventHandler<ViewState> = (viewState: ViewState, coordinate: string) => void
export type JayNativeEventHandler<NativeEvent, EventData, ViewState> = (ev: NativeEvent, viewState: ViewState, coordinate: string) => EventData
type JayNativeFunction<ElementType extends HTMLElement, ViewState, Result> = (elem: ElementType, viewState: ViewState) => Result
interface JayNativeEventBuilder<ViewState, EventData> {
   then(handler: (eventData: EventData, viewState: ViewState, coordinate: string) => void): void
}
```

Single Element
---
```typescript
export interface HTMLElementProxy<ViewState, ElementType extends HTMLElement> {
  addEventListener(type: string, handler: JeyEventHandler<ViewState>)
  removeEventListener(type: string, handler: JeyEventHandler<ViewState>)
   
  onclick(handler: JeyEventHandler<ViewState>): void
  $onclick<EventData>(handler: JayNativeEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  //... other event handlers

  $exec<ResultType>(handler: JayNativeFunction<ElementType, ViewState, ResultType>): ResultType
}
```

Dynamic list of Elements
---
```typescript
export interface HTMLElementCollectionProxy<ViewState, ElementType extends HTMLElement> {
  addEventListener(type: string, handler: JeyEventHandler<ViewState>)
  removeEventListener(type: string, handler: JeyEventHandler<ViewState>)
   
  onclick(handler: JeyEventHandler<ViewState>): void
  $onclick<EventData>(handler: JayNativeEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
   //... other event handlers

  find(predicate: (t: ViewState) => boolean): HTMLElementProxy<ViewState, ElementType>
  $exec<ResultType>(handler: JayNativeFunction<ElementType, ViewState, ResultType>): Array<ResultType>
}
```

Shared Declarations for Elements:
---
```typescript
export type JayComponentEventHandler<EventData, ViewState> = (ev: EventData, viewState: ViewState, coordinate: string) => void
export interface ComponentEventDefinition<EventType> {
   (handler: (event: EventType) => void)
   handler?: (event: EventType) => void
}
```

Given a component with interface
---
```typescript
interface ChangeEvent {
  newValue: number
}
export interface CounterComponent extends JayComponent<CounterProps, CounterVS, CounterElement> {
   onChange: ComponentEventDefinition<ChangeEvent>
   getFormattedCount(): string
}
```

Single Component
---
```typescript
export interface ComponentProxy {
   addEventListener(type: string, handler: JayComponentEventHandler<any, ViewState>)
   removeEventListener(type: string, handler: JayComponentEventHandler<any, ViewState>)

   onChange(handler: (event: ChangeEvent, viewState: ViewState, coordinate: string)=> void): void
   
   getFormattedCount(): string
}
```

Dynamic list of Components
---
```typescript
export interface ComponentCollectionProxyOperations<ViewState, ComponentType extends JayComponent<any, ViewState, any>> {
   addEventListener(type: string, handler: JayComponentEventHandler<any, ViewState>)
   removeEventListener(type: string, handler: JayComponentEventHandler<any, ViewState>)

   onChange(handler: (event: ChangeEvent, viewState: ViewState, coordinate: string)=> void): void
   
   map<ResultType>(handler: (comp: ComponentType, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType>
   find(predicate: (t: ViewState) => boolean): ComponentType
}
```