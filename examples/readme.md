# Jay Examples

The Jay examples folder includes 5 categories of examples, demonstrating different aspects of Jay.

## Jay

Demonstrates the plain usage of Jay, and includes the examples

### counter

Sandboxed counter as a Jay Component running from a worker

### form

Sandboxed form as a Jay Component running from a worker

### head-links-demo

Demonstrates how Jay-HTML handles head links, showing various types of `<link>` elements that are automatically injected into the document head.

### mini-benchmark

Sandboxed and non sandboxed versions of the jay benchmark

### scrum-board

Scrum board example

### todo

Sandboxed and non sandboxed versions of the Todo MVC project

### todo-one-flat-component

non sandboxed Todo MVC as a single component

### todo-rollup-build

non sandboxed Todo MVC using plain rollup build

### tree

a non sandboxed version of a tree, with recursive component structure

### tree-recursive

Demonstrates recursive HTML structures using `forEach` iteration. Shows how to build a tree with expandable/collapsible nodes where the recursion happens within a single HTML structure using `<recurse>` elements. This pattern is ideal for homogeneous tree structures (file browsers, nested comments, etc.) where all nodes share the same structure.

### btree-recursive

Demonstrates recursive HTML structures using the `accessor` attribute for binary trees. Shows how to build a binary tree visualization where left and right children are accessed via explicit accessors. This pattern is ideal for heterogeneous recursive structures (binary trees, linked lists, DOM trees) where different paths need to be followed to reach child nodes.

## Jay 4 React

Demonstrates how to use Jay Components with a React project.

### todo

A Todo MVC example written in Jay, compiled to React and used by a React application.

## Context API

Example of using the Jay Context API

### Scrum board with Context

A Scrum board example utilizing context API

### Todo with Context

Todo MVC with sandboxed and non-sandboxed examples of using context API

## Low level APIs

Examples of using the element only APIs, without jay-component.

### Counter Raw

Shows a counter element

### Todo Raw

Shows a Todo MVC example without the component package

## React

### mini-benchmark-react

The react version of the mini-benchmark example, for comparing performance
