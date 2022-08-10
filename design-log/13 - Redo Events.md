Redo Events
=====
         

Reminder
--- 

Reminder from [Events](05%20-%20events.md) we have chosen to create events using the ref object

```typescript
refs.dec.onclick = event => dec()
```

The `event` parameter is the native DOM event object.

For events on elements under a `forEach` construct, we also get the data item

```typescript
refs.label.onclick = (event, viewState) => dec(viewState);
```
Again, the `event` is the native DOM event object, while the viewState 
is the current data object from the latest `forEach` relative to the element.

New Requirements
---

Incorporating into the requirements for events the needs from [secure architecture](12%20-%20Secure%20Architecture.md) 
we need to change the events model a bit different

1. Support secure context, which means event handler does not have access to the DOM
2. Support scoped access to the DOM, which enables 
   1. secure and custom logic
   2. reading values from the DOM
   3. returning values to the event handler
   4. conditionally invoke 'APIs gated by user activation'
3. Unify the event handler for static and `forEach` elements
4. Getting the element coordinate to facilitate main to sandbox communication

The New (low level) API
---

presented are 4 variants of the API
(the compiler can introduce higher level abstractions over the API, making it more user friendly)
                              
// with native handler (which can be secure)
```typescript
refs.dec.onclick.nativeHandler((event, viewState) => {return event.target.value})
  .handler((value, viewState, coordinate) => {})

refs.dec.onclickNative((event, viewState) => {return event.target.value})
  .then((value, viewState, coordinate) => {})

refs.dec.onclick = native((event, viewState) => {return event.target.value})
        .then((value, viewState, coordinate) => {})

refs.dec.onclick = createNativeEvent((event, viewState) => {return event.target.value})
        .then((value, viewState, coordinate) => {})

```

// without native handler
```typescript
refs.dec.onclick.handler((viewState, coordinate) => {})

refs.dec.onclick((viewState, coordinate) => {})

refs.dec.onclick = (viewState, coordinate) => {}

refs.dec.onclick = createEvent((viewState, coordinate) => {})
```
                   
Investigating code completion for the event type and view state types, we see that 
the 3rd and 4th options do not work. We can see an example [here](https://www.typescriptlang.org/play?#code/FASwdgLgpgTgZgQwMZQAQCkEE8CiA3KSAHgDUQoB3AZQgWgD5UBvYVN1ACj3OtugC5UZSjTpQANKiQB7aTAAm4MYIDOEGOADmASkF5pIeQG5gAX2DB5UJABsEMNHACuYJBBDSwUh2PyEIpDyiDBwAFghg8jawgpi4BMTCvGL0uhjYfolBfFD0FuDQ8MhocQBydCAEmQHVkknBEqjVACJ0CIws7JxQCRCCtajcIjmC9TlpLW1m+ZCwiCjpWOXuVb0AQk4gNlYwRANjYpKTtIxQAB7QkSqLy5VQ1Xu9ddmHTb2tJ8ys7BChhGERKIxbrvNr9UG0SRDZICIQvaCSGRyRRgZSoNQaMA6VAAXkY+kMaTKFVW-ke-mew1ex3a00s1jsDlQzlc7k83igYlupOI+3hjRp9ABkWiMFi2G59165MglJhAoh7SJEpJUv8Gy2OxlEDlDSOirywFsCBU1xw0QAtoEqQwvl1PLYQEgANYAfnF8TJBwY3zYnklAGEbE63R7JQ8ALLSJwqNWyuE2xoRLB5czACBYAAOaBIVFxXzpeHsqCgNn6ltIVEYONQYEoTUtHG0JlLADoHcGXfmkD5oNUOFx+YjpNpcR1UKZtMA2-7VUGQ7jfRyuar+xwev5BFGY3GdYN+aMqKO8cxUA4IE4YF4AIwAdgnU66XVbv3+68VUKHUlkChAYmP46TsAQA).

The 2nd option works - we can see that [here](https://www.typescriptlang.org/play?#code/FDCWDsBcFMCcDMCGBjaACAUogngOUZKAG7QCiJUAQgK6gA2AJnADwBqo0A7gMqQHQAaNOWhQAIgUQA+NAG9gaNJAAWogBTLE4BnTgAuNGugVIEvgZHjJQohx58YB9l178hyAPYfYDCPwMAzpCwEADmAJRoALwyRB6gDOEGcQnAAL4gyHSIAQHCugC2bHauMDLyih7gWaDIANYaWjr6hrYuDtBOJR3uXj5+jmhBIeAR0bHxicmTciCKGYoAJFU19cyWppJSjdq6sAZGJgYAsh7UAWQmNt3+aM72-JExwiZmiJEGWHgExJeikDR6ExYMV2m4Xv83uUFIo0LBoJBqLBwLNYbCVKIDk9ygtYbiMhlgERELA0NA6BZCsxhmEZFE0OAuPloEUaaNtuEANzAckAOhWdFqDTUbQeMF63l84Ee4zkaXCPLovOW1UF9TUh3+1zBMGxcnhiORaAAjAB2eUw3kY8Aa4yQ6xoUWlQRoTyS0Ay56yC1AA)

### Final API

```typescript
refs.el.onclick((viewState, coordinate) => {})
refs.el.$onclick((event, viewState) => {return 17})
  .then((eventData, viewState, coordiate) => {})
```

formally, we generate Refs elements as
```typescript
interface JayNativeEventBuilder<ViewState, EventData> {
  then(handler: (eventData: EventData, viewState: ViewState, coordinate: string) => void): void
}

interface Element<ViewState> {
  onclick(handler: (viewState: ViewState, coordinate: string) => void): void
  $onclick<EventData>(nativeHandler: (event: MouseEvent, viewState: ViewState) => EventData) : JayNativeEventBuilder<ViewState, EventData> 
}
```
           
### How it works 

The two events patterns are
1. `onclick` events when there is no need to access the native event, or use APIs gated by user action.
2. `$onclick` enabling access to the native event.

with regular (non-secure) runtime, the first pattern is trivial, 
while the second just runs the `nativeHandler` and then the `handler`.


For sandbox (secure) components, a few things happen

```typescript

refs.dec.$onclick((event, viewState) => {return event.target.value})
  .then((value, viewState, coordinate) => {console.log(value)})
```

transforms into 
```typescript
// main window / secure context
import {f12} from 'native-handlers'

refs.dec.onclick((event, viewState, coordinate) => {
  channel.invokeEvent(f12(event, viewState), componentId, coordinate)
}) 

// secure context / component
refs.dec.onclick((value, viewState, coordinate) => {console.log(value)})
```

1. The compiler detects `$onclick` in the component
2. For the component bridge, it creates an equivalent `onclick`, with code compiled from the native handler
3. For the component itself, it replaces `$onclick` with `onclick` running the second function