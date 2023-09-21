# What is the Jay Project?

The Jay project started as an attempt to separate design from code and separate Design workflow
from Coding workflow, solving the handover problem Design -> Code. It has evolved into solving
another problem of user interface inclusion from a 3rd party securely.

In a nutshell, the Jay Project is a Rendering Toolset that takes a Jay file, from which it compiles

1. a Runtime Component
2. a Typescript Definition
3. a Testing driver
4. "run in secure context" modules

![Overview](./01%20-%20what%20is%20Jay%20-%20overview.png 'Overview')

# Motivations

## Design to Code

The handover problem from design to code is sourced in using different tools and different paradigms,
with few common language concepts. This leads to a workflow at which the designer designs using
dedicated design tools such as Figma, Photoshop, Axure, does an export to semi-HTML / CSS / Image formats.
The developer then takes those resources and implements the design using Javascript libraries such as
React, Vue, Angular, Svelte. Like any handover, the developer will either implement it a bit of, or during
the implementation some issues will arise, causing the need to perform another round of checks, design and
code fixes, and another round and another... This process tends to become very expensive.

Jay aims to solve that by introducing Jay Code files that design tools can export and update, and developers
can import and use. The idea is to let the **Designer implement the Design** and let the
**Developer implement the logic**.

Exploring the potential formats for a Jay File, there is a single format that is **Forward Compatible** -
will always support any new web standard and evolution of HTML and CSS - and that's HTML and CSS.

A Jay file at the time of writing this doc looks like the following

```html
<html>
  <head>
    <script type="application/yaml-jay">
      data:
          items:
              name: string
              completed: boolean
              cost: number
              id: string
          title: string
    </script>
  </head>
  <body>
    <div>
      <h1>{title}</h1>
      <div>
        <div forEach="items" trackBy="id">
          <span style="color:green; width: 100px; display: inline-block;">{name}</span>
          <span style="color:red; width: 100px; display: inline-block;">{completed}</span>
          <span style="color:blue; width: 100px; display: inline-block;">{cost}</span>
        </div>
      </div>
    </div>
  </body>
</html>
```

Notice that the Jay File is just an HTML file, with two simple additions

1. Definition of the Data of the Jay Component this file compiles into (more about the compiler process later)
1. Custom derivatives (`forEach`, `trackBy`, `{name}`) for data rendering and rendering arrays

The high level idea is that the Jay File is transformed into a Javascript component that the developer can use
directly in their code as

```typescript
import { render, ViewState } from 'my-jay-file.jay.html';

let update;
function init(initialData: ViewState) {
  let target = document.getElementById('target');
  let { dom, update } = render(data);
  target.appendChild(dom);
}

function onSomeEvent(newData: ViewState) {
  update(newData);
}
```

## 3rd Party UI Inclusions

The problem of 3rd Party UI Inclusions happens when we have a web screen that we wish to extend with
new components or UI elements that are developed by a 3rd Party. Such cases are more common than initially obvious,
from dashboards and control panels, to website plugins, going all the way even into use cases like google docs
plugins or GMail plugins.

On the web platform, there is only one existing technical tool to isolate one `(Javascript, domain)` context from
another - IFrames.

Why do we need to isolate `(Javascript, domain)`? When including 3rd party code into a `(Javascript, domain)` context,
the 3rd party code has access to all globals of the `Javascript` running context as well as access to all
HTTP assets and APIs on the same `domain`. While WebWorkers isolate Javascript contexts, they cannot isolate domain context. IFrame is the only tool that does both.

Jay comes into play as it compiles a logic free HTML / CSS file - creating a "safe code" component that can be
included into the "main" `(Javascript, domain)`, while running the component logic (which may contain "unsafe code")
in another `(Javascript, domain)`.

The Jay compiler can generate the needed `run in safe context` modules for the component, ensuring no degradation
in developer or designer experience.

# Requirements from Jay

## Contract between design and code

The main requirement from Jay project is to have a contact between design and code - one that design tools can export
and update, and one that code can import and work with directly.

The contact file should be such that on a change, the impact on the code is clear - for instance by using a type
system such as typescript.

## Forward Compatibility with HTML / CSS

The Jay Contact should be forward compatible with any future HTML or CSS Standards.

## Performance

Jay should generate runtime components that have great performance - which means two things

1. runs at 60 FPS
1. minimal bundle size

## Security

Jay should generate secure components that can be included into host applications as 3rd party inclusions.
This means that the Jay component itself works in the main frame, while the logic (which may be unsafe) has
a "safe" solution

## SEO / SSR / JAMStack Compatibility

Jay should generate plain HTML generating function that can be used in SSR or JAMStack generation process to
generate static HTML files for SEO or performance optimizations.

## Decoupled from Host libraries release cycle

Jay should generate components that are decoupled from the host application libraries. The reasoning is to
allow decoupled release cycle of the host application and the Jay Components, including dependent library updates.
