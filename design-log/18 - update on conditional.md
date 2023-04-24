Update on Conditional
==============

Conditional, as implemented today, creates the condition child elements
immediately on creation, even if the condition is `false`.

This imposes a potential performance impact, as we may be doing 
unneeded work on creation time.

However, this design also simplifies `refs` as the `refs` to static 
elements as children of a condition are just static refs.

If we change condition to create the children lazily on first turning to `true`,
it means that `refs` to children of a condition has to support the case of children not created yet,
and turn into a construct similar to `refs` for a collection.

For now, we vote to keep the design decision as is.