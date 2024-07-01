# Events propagation between components

It is easy to understand the data source of truth and flow from parent to children in the components dependency tree,
But it is not that clear, how to, **nicely**, communicate between a components and other components in the application.

A component has parent and children.
It knows its children (by using refs) but does **not** know its parent (and ancestors).
A component can only call a child function, so in order to have cross components communication,
A child comp needs to expose registration on events function, for its parent to be able to register on its descendants' events.

