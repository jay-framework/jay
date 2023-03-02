Main to Worker Communication Protocol
====

This document tries to capture the challenges in defining and creating the communication 
protocol between the main window (running elements and component bridges) and the 
sandbox (running components and element bridges).

The protocol
-------

On secure context initial creation:

![Jay Communication Protocol 1](15%20-%20main%20to%20worker%20communication%20protocol%20-%201.md.png)

The main window sends a `JPMRootComponentProps` message with the `ViewState` of the element
opting in to use a secure component. The worker root is using this `ViewState` to start 
the rendering process in the sandbox environment.

As the rending of components continues within the sandbox environment, each element bridge
records the input `ViewState` it gets and sends a `JPMRender` message to it's corresponding
component bridge.

Two important things to remember here - 
1. for performance, we do not compute component props on the main window, rather, we compute
   props in the sandbox. We render all the tree in the sandbox, recording all the `JPMRender` messages.
2. again for performance, while the protocol models multiple `JPMRender` messages, the underlying
   channel only sends a single low level message that batches all the protocol messages.

![Jay Communication Protocol 2](15%20-%20main%20to%20worker%20communication%20protocol%20-%202.md.png)

When registering events, the element bridge sends a `JPMAddEventListener` message to the 
component bridge, with the `refName` of the sub-element to add the event for, and `eventType` 
to listen for.

When an event is triggered, the component bridge captures the event. For regular events, 
it only sends the `coordinate` and `eventType` of the actual event. For events registered 
using `$onX`, it also adds the computed `eventData`. The data is sent as a `JPMDomEvent` 
message to the element bridge, who triggers the event on the original component

The addressing challenge
-----

As we can see above, one of the challenges is directing messages between the pair of component and 
element bridges at the same place in the tree. Because the tree structure, `forEach` and `if` 
statements, the tree structure cannot be statically determined.

We denote `CompId` as a `number` value that facilitates the communication between the bridges - that is,
component bridge `CompId: 2` communicates with element bridge `CompId: 2`.

![Jay Communication Protocol 3](15%20-%20main%20to%20worker%20communication%20protocol%20-%203.md.png)

The derive the relationships between element bridge and component bridge, we need to look
at the parent component and the coordinate within the parent component's element.
That is, we compute `CompId` based on `(parent CompId, coordinate in parent)`.

`CompId:2` ~~ `CompId:1` + `Coordinate: a` 

We also need to think of the order of components and elements creation - the main point of
which is that a child is always created after the parent, and has the creation context 
internally in the runtime package. It terms of `CompId` allocation - who allocates between the
main and sandbox, there is no one clear answer - for static elements and components, the 
main window will be first. For dynamic elements and components, the sandbox will be first.

For the element bridge `CompId: 2` to generate the `CompId`, it needs to look up the stack
for the element bridge `CompId: 1` and to the `coordinate: a` of a sub-element of `CompId: 1`.

For the component bridge `CompId: 2` to generate the `CompId`, it needs to look up the stack
for the component bridge `CompId: 1` and to the `coordinate: a` of a sub-element of `CompId: 1`.

Both imply a context API for Jay that can be used by the secure package to access the parent 
`CompId` and `coordinate`.

The formal communication protocol
-----

```typescript
export interface JayPort {
    getRootEndpoint(): JayEndpoint;
    getEndpoint(parentCompId: number, parentCoordinate: string): JayEndpoint;
    batch(handler: () => void)
    flush()
}

export interface JayEndpoint {
    post(outMessage: JayPortMessage);
    onUpdate(handler: JayPortInMessageHandler)
    get compId(): number;
}
```

* `JayPort` - the connection to the protocol. Each side, the main and the sandbox, have
  one port to facilitate the communication
  * `getRootEndpoint` - gets an endpoint that represents the tree root, that is, does not 
    have a parent component
  * `getEndpoint` - gets an endpoint that represents a specific bridge communication with it's partner bridge.
    the call to `getEndpoint` also triggers the generation of the `CompId` based of the provided parameters
  * `batch` - record all messages send via the endpoints during the handler run, 
     and flush all messages as one batch when the handler completes
  * `flush` - flushes all messages, if messages are added without `batch`
* `JayEndpoint` - the actual interface bridges are using
  * `post` - send a message to the partner bridge
  * `onUpdate` - listen to messages from the partner bridge
  * `compId` - get the compId.