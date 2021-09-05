# The kindergarten

The kindergarten is a software library that manages the children of an HTML node. 
It provides a high level abstraction over the APIs of the HTML node itself, 
key to manage different groups of children, each group with a different logic.

Consider a node who has one conditional child, another set of children bound to an array
and a 3rd conditional child. The logic of binding the elements of the array to the nodes 
needs to use the node indexes, which are dependent on the first conditional node.
The second conditional node depends on the first and the array.

The kindergarten manages this logic for us. It models the above as

| group | nodes | group offset |
| --- | --- | --- |
| 1  | zero or one element, depending on the condition | 0 |
| 2  | zero to N elements, depending on the array | #(group 1 elements) |
| 3  | zero or one element, depending on the condition | #(group 1 elements) + #(group 2 elements)| 


The kindergarten API is 

```typescript
declare class Kindergarten {
    readonly parentNode: HTMLElement;
    constructor(parentNode: HTMLElement);
    newGroup(): KindergartenGroup;
    getOffsetFor(group: KindergartenGroup): number;
}
```

which allows to create groups and get the index offset of a group.

The KindergartenGroup API is 

```typescript
declare class KindergartenGroup {
    children: Set<Node>;
    constructor(kindergarten: Kindergarten);
    addListener(groupListener: KindergardenGroupListener): void;
    ensureNode(node: Node, atIndex?: number): void;
    removeNode(node: Node): void;
    removeNodeAt(pos: number): void;
    moveNode(from: number, to: number): void;
}
```

* ensureNode - makes sure the provided node is at the provided index, relative to the group offset
* removeNode - removes the HTML node
* removeNodeAt - removes the node based on it's index relative to the group offset
* moveNode - moves the node from an index to an index, both relative to the group offset
* addListener - adds a listener to for the group mutations, to listen on adding and removing nodes from the group