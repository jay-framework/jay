# Partial Rendering

Partial Rendering is when we have `jay-html` file and a `jay-stack` component has a slowly changing phase.
The slowly changing phase generates `Partial<ViewState>` which we can use to partially render the `jay-html` file.

What it means is that
1. We inline all the slowly `Partial<ViewState>` into the `jay-html`
2. If we have multiple `UrlParams`, that is we have multiple result HTML pages for a route, we inline into
   each result HTML separately
3. If we have conditions that are bound to an inline member of `Partial<ViewState>`, we resolve the condition 
   (delete false branches)
4. If we have forEach that are bound to an inline member of `Partial<ViewState>`, it is rendered as a static list
5. The inlined `jay-html` is used for fast rendering phase and for interactive rendering.

## how it works

The component Slowly rendering phase generates a `Partial<ViewState>`. 
Given this partial view state, the jay compiler transforms the jay-html into the inlined jay html.

The jay-html includes bindings to the `ViewState` of different types, and each is handled in the appropriate way.

## text, property and attribute bindings

Such bindings are written as `{field}` or `{field.a.b.c}` or `word {field} words {fields2}...`. 

The normal compiling generates `dt(vs => vs.field)` or `dt(vs => vs.field?.a?.b?.c)`, using `dp`, `da` or `dt` for 
property, attribute or text.

It is compiled as a template of values.

Given a value, we compile the expression into a value by inlining the value. If the expression becomes static,
it is handled as a static text and not a function. If there are any unbound values, it remains a function.

Given a value for `field=world`, the expression `{field}` turns into `world`
Given a value for `field=world`, the expression `hello {field}` turns into `hello world`
Given a value for `field=world`, the expression `hello {field} from {geo}` turns into `dt(vs => 'hello world from ${vs.geo}')`

## conditions

Such expressions are written as `member` or `member.a.b.c`, and are normally compiled into 
`vs => vs.member` or `vs => vs.member.a.b.c`.

It is compiled as a condition.

Condition expressions can also use `!` for not expressions, or equals to enum values, such as
`!member` which turns into `vs => !vs.member` and `anEnum === one` which turns into `vs => vs.anEnum === AnEnum.one`.

Given a value for member, the condition can be resolved to a `true` or `false` value, which is then used to decide if 
to include the condition element tree or not.

## forEach

For each iteration member, which returns the item to iterate over, normally looks like 
`member` or `member.a`

It is normally compiled into a function such as `(member: MemberType) => member` or `(member: MemberType) => member?.a`. 

It is compiled as an accessor.

Given a value for the accessed iteration items, we can remove the forEach and instead just render the forEach items
into the jay-html.

## class expressions







