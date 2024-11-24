## Design handover problem

Learning from other project, we know that code generation is great for one way export, but fails on re-export. like any
development process, the work a designer does is never one off, but an iterative process at which the designer makes some design,
the developer builds some part of the application, then due to feedback (dev feedback, QA, product, early adopters, etc) the designer
updates the design, then the developer re-implements the design, etc.

![iterative design and feedback](./Into%20to%20Jay%201.png) 'iterative design and feedback'

Because there is no good tool for design export and re-export, we find that today, the way designers and developers are working
is by the **designer designing and the developer _re-implementing_ the design** using code tools. The designer will export design
assets using tools like Adobe XP or photoshop, which are CSS snippets, image snippets, SVGs, etc. The developer, using those
design assets, will build the UI using tools like JSX, SSAS, etc.

![Comparing Jay with known workflow](./Into%20to%20Jay%202.png 'Comparing Jay with known workflow')

Jay approach is to create a **declarative format** that can be generated from design tools, and used directly by the code.
This declarative format includes a contract that once coded against, the code does not change even if design changes drastically.
As the designer continues to update the design, the developer code who is using the design should inherit the update automatically.
Only if the contract between design and code changes, the developer will need to update the code - and should see type safe validations
that represent that contract change.

The next question is which format should the Jay file take? To answer that question we need to formulate the requirements from the Jay File -

1. should be declarative that a design tool can generate
2. should support any existing HTML / CSS capability
3. should support any future HTML / CSS capability

When examining this question and requirements, there is only one potential format that meets all of those - and that is HTML / CSS.
