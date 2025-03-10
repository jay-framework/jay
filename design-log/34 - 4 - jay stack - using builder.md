# Jay Stack - using builder

This option defines the component as a builder, to create the most tight jay stack component definition
which includes full type completion.

While all 3 previous API attempts have failed to capture in the type system how the different stages affect
each other, the builder pattern has potential to solve it.

1. introducing a url parameter in the load parameters stage should enter the type signature for later stages
2. introducing context should enter the type signature of later stages
3. introducing slowly rendered data should reduce the dynamic rendered data to what was not slowly rendered.

However, a builder pattern has one inherit problem, that it is not ordered by default. One can call the 
builder pattern functions in any order, including multiple times. Yes, we can check that one runtime, but the type 
system by default does not guarantee it. However, using a simple trick we can also support builder pattern ordering. 

```typescript
const productPage = makeJayStackComponent(render)
    .withProps<PropsType>()
    .withServerContext(CONTEXT_1, CONTEXT_2, CONTEXT_3)
    .withClientContext(CONTEXT_1, CONTEXT_2, CONTEXT_3)
    .withLoadParams(loadParams)
    .withSlowly(renderSlowly)
    .withfast(renderFast)
    .withInteractive(interactive)
```

This pattern allows us to refine types as we proceed calling builder functions, while giving developer feedback from 
type inference. This pattern allows a developer using inline functions to not define any types for carry forward or 
the static and dynamic view states, having them inferred by Typescript. 

To solve the inherit ordering problem we define a type based state machine which we use to define for each builder 
function when it is available. 

Such a pattern looks like
```typescript
// Define the state progression
type State = "Initial" | "NameSet" | "ValueSet" | "FlagSet" | "Built";

// Builder type based on state
type Builder<S extends State> =
  S extends "Initial" ? { setName(name: string): Builder<"NameSet"> } :
  S extends "NameSet" ? { setValue(value: number): Builder<"ValueSet"> } :
  S extends "ValueSet" ? { setFlag(flag: boolean): Builder<"FlagSet"> } :
  S extends "FlagSet" ? { build(): Product } :
  S extends "Built" ? { getProduct(): Product } :
  never;
```

We can utilize the same for our full stack component builder.

The steps we have are 
```typescript
type State = "Props" | // requires setting the props type. Next allowed states are "ServerContexts", "ClientContexts", "UrlLoader", "Slowly", "Fast", "Interactive"
             "ServerContexts" | // allowing to set server contexts. Next allowed states are "ClientContexts", "UrlLoader", "Slowly", "Fast", "Interactive"
             "ClientContexts" | // allowing to set client contexts. Next allowed states are "UrlLoader", "Slowly", "Fast", "Interactive"
             "UrlLoader" | // allowing to set the urlLoader function. Next allowed states are "Slowly", "Fast", "Interactive"
             "SlowlyRender" | // allowing to set slowly render function. Next allowed states are "Fast", "Interactive"
             "FastRender" | // allowing to set slowly render function. Next allowed states is only "Interactive"
             "InteractiveRender" | // allowing to set the slowly render function. Next step is a placeholder for done
             "Done" // does not allow setting anything more
```

The full builder is then (before implementing the state machine above)

```typescript
import {ComponentConstructor, ContextMarkers, JayComponentCore} from "jay-component";
import {JayElement, PreRenderElement} from "jay-runtime";

export interface PartialRender<ViewState extends object, CarryForward> {
    render: Partial<ViewState>,
    carryForward: CarryForward
}

export type UrlParams = Record<string, string>;
export type LoadParams<ServerContexts, Params extends UrlParams> = (contexts: ServerContexts) => Promise<Iterator<Params>>
export type RenderSlowly<ServerContexts extends Array<object>, PropsT extends object, StaticViewState extends object, SlowlyCarryForward> =
    (props: PropsT, ...contexts: ServerContexts) => Promise<PartialRender<StaticViewState, SlowlyCarryForward>>
export type RenderFast<ServerContexts extends Array<object>, PropsT extends object, SlowlyCarryForward, DynamicViewState extends object, FastCarryForward> =
    (props: PropsT & SlowlyCarryForward, ...contexts: ServerContexts) => Promise<PartialRender<DynamicViewState, FastCarryForward>>


export type Builder<
    StaticViewState extends object,
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    PropsT extends object,
    CarryForward extends object,
    CompCore extends JayComponentCore<PropsT, ViewState>
> = {

    // constructor(public readonly render: PreRenderElement<ViewState, Refs, JayElementT>) {}
    withProps<NewPropsT extends object>():
        Builder<StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, NewPropsT, CarryForward, JayComponentCore<NewPropsT, ViewState>>;

    withClientContext<NewClientContexts extends Array<any>>(...contextMarkers: ContextMarkers<NewClientContexts>):
        Builder<StaticViewState, ViewState, Refs, JayElementT, ServerContexts, NewClientContexts, PropsT, CarryForward, CompCore>

    withServerContext<NewServerContexts extends Array<any>>(...contextMarkers: ContextMarkers<NewServerContexts>):
        Builder<StaticViewState, ViewState, Refs, JayElementT, NewServerContexts, ClientContexts, PropsT, CarryForward, CompCore>

    withLoadParams<NewParams extends UrlParams>(loadParams: LoadParams<ServerContexts, NewParams>):
        Builder<StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT & NewParams, CarryForward, CompCore>

    withSlowlyRender<NewStaticViewState extends Partial<ViewState>,
        DynamicViewState extends Partial<ViewState> & Omit<ViewState, keyof NewStaticViewState>,
        NewCarryForward extends object,
        NewCompCore extends JayComponentCore<PropsT, DynamicViewState>>(
        slowlyRender: RenderSlowly<ServerContexts, PropsT, NewStaticViewState, NewCarryForward>):
        Builder<NewStaticViewState, DynamicViewState, Refs, JayElement<DynamicViewState, Refs>, ServerContexts, ClientContexts, PropsT,
            NewCarryForward, NewCompCore>

    withFastRender<NewCarryForward extends object>(
        fastRender: RenderFast<ServerContexts, PropsT & CarryForward, CarryForward, ViewState, NewCarryForward>):
        Builder<StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, NewCarryForward, CompCore>

    withInteractive(comp: ComponentConstructor<PropsT & CarryForward, Refs, ViewState, ClientContexts, CompCore>):
        Builder<StaticViewState, ViewState, Refs, JayElementT, ServerContexts, ClientContexts, PropsT, CarryForward, CompCore>
}

// BuilderImplementation ommitted for clarity

export function makeJayStackComponent<
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>
>(render: PreRenderElement<ViewState, Refs, JayElementT>) {
    return new BuilderImplementation(render) as unknown as
        Builder<object, ViewState, Refs, JayElementT, [], [], {}, object, JayComponentCore<object, ViewState>>
}
```