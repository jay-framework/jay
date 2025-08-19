# View State Types

The Jay type system, represented internally as `JayType` in 
[jay-type.ts](..%2Fpackages%2Fcompiler%2Fcompiler-shared%2Flib%2Fjay-type.ts) describes the type system
used to represent the `Data` and `Variant` parts of a contract.

The current supported types are 
* `string`
* `number`
* `boolean`
* `Date`
* `enum`
* `object`
* `array`

## Adding Types

To have full support for a type system, we need to extend the type system with additional types

* `Promise<JayType>` - allows a component to render a promise, which is a variant of pending and ready.
* `Currency` - which is a pair of currency symbol and amount
* `DateWithTimezone` - date with a specific timezone to be rendered at

## Promise of Objects and Arrays

For complex types like objects and arrays, the `async variant of <type>` syntax becomes unwieldy. Instead, we use an `async: true` property on the tag itself to indicate that the nested structure is asynchronous.

### Object Promise

```yaml
# Instead of: async variant of UserProfile
- tag: userProfile
  type: data
  async: true
  tags:
    - tag: name
      type: data
      dataType: string
    - tag: email
      type: data
      dataType: string
    - tag: preferences
      type: data
      async: true
      tags:
        - tag: theme
          type: data
          dataType: string
        - tag: language
          type: data
          dataType: string
```

### Array Promise

```yaml
# Instead of: async variant of Notification[]
- tag: notifications
  type: data
  async: true
  repeated: true
  tags:
    - tag: id
      type: data
      dataType: string
    - tag: message
      type: data
      dataType: string
    - tag: timestamp
      type: data
      dataType: date
```

### Mixed Promise Types

```yaml
tags:
  - tag: userProfile
    type: data
    async: true
    tags:
      - tag: name
        type: data
        dataType: string
      - tag: email
        type: data
        dataType: string
  - tag: settings
    type: data
    async: true
    tags:
      - tag: theme
        type: data
        dataType: string
      - tag: language
        type: data
        dataType: string
  - tag: notifications
    type: data
    async: true
    tags:
      - tag: item
        type: data
        tags:
          - tag: id
            type: data
            dataType: string
          - tag: message
            type: data
            dataType: string
          - tag: timestamp
            type: data
            dataType: date
```

This approach maintains the YAML structure while clearly indicating which tags are asynchronous, making contracts more readable and maintainable. The `async: true` property is a simple boolean flag that can be applied to any tag that has nested structure.

## Timezone

Another challenge is that in Javascript, on the Browser, a `Date` object is always rendered at the browser local timezone
unless otherwise specified in date formatting. But there are cases when we want to render a date in a specific timezone,
other then the browser. For those cases, the timezone itself is a parameter.

For simplicity, we suggest creating a new type that id a pair of a Date and Timezone, such as 

```typescript
type DateWithTimezone = {
    date: Date,
    locales: string[] // the locals to use when formatting the date above
}
```

## local

The best practice with Web Applications and Websites is to use the client browser local to select from site available
locals. Jay offers per local rendering, given a list of locals to support for a site. All the formatting below
assumes the local was determined beforehand and is used with the formatting objects.

## Formatting

We also need to add formatting support into the Jay-HTML files. We map our types to formatting support as

* `Date` --> `Intl.DateTimeFormat`, using the local timezone
* `DateWithTimezone` --> `Intl.DateTimeFormat`, using the provided timezone
* `Number` --> `Intl.NumberFormat`
* `Currency` --> `Intl.NumberFormat`, with style `currency`

## Jay-HTML and contract support

The new types are added to the jay-html type system, such that full typesystem in Jay HTML is extended
to be

| name in Jay HTML or Contract   | jay type              |
|--------------------------------|-----------------------|
| string                         | `JayString`           |
| number                         | `JayNumber`           |
| boolean                        | `JayBoolean`          |
| date                           | `JayDate`             |
| zoned-date                     | `JayZonedDate`        |
| currency                       | `JayCurrency`         |
| async variant of &lt;type&gt;  | `JayPromise<JayType>` | 
| async &lt;type&gt; (shorthand) | `JayPromise<JayType>` | 

## update on async

to better support both objects and arrays in `jay-html`, we changed the syntax to include the word `async` as part 
of the property name, not the property type.

e.g.
```yaml
data:
  async name: string
  async userProfile:
    name: string
    email: string
  async notifications:
    - id: string
      message: string
```

## update on formatting

When considering both currency and timezone, we need to consider that formatting
can be dynamic (something determined by the application logic) or something static.
We also need to consider the designer role, who creates the `jay-html` file using visual
editorial tools - should the designer lean all the formatting options and locale rules?

The end result is that we believe formatting of dates and currencies should be done in one 
place, that is the component logic, and that `jay-html` and a contract file should not 
handle formatting.

It also means that Jay will be less oppinionated with `Currency` and `ZonedDate` types, 
instead letting the application developer choose their own types as needed.
