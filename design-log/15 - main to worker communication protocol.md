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

We denote `CompId` as a value that facilitates the communication between the bridges - that is,
component bridge `CompId: 2` communicates with element bridge `CompId: 2`.

![Jay Communication Protocol 3](15%20-%20main%20to%20worker%20communication%20protocol%20-%203.md.png)

The derive the relationships between element bridge and component bridge, we need to look
at the parent component and the coordinate within the parent component's element.
That is, we compute `CompId` based on `(parent CompId, coordinate in parent)`.

`CompId:2` ~~ `CompId:1` + `Coordinate: a` 
