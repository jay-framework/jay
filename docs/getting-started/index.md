# Getting Started with Jay

Welcome to Jay! This guide will help you get up and running with the framework that bridges the gap between design and code.

## What is Jay?

Jay is an experimental framework that solves the design-to-code challenge by creating a contract between design tools and headless components. It enables designers to work in their preferred tools while developers build type-safe, reusable components.

### Key Features

- 🔗 **Design-to-Code Bridge** - Seamless integration between design tools and code
- 🛡️ **Zero Trust Security** - Safe 3rd party component integration
- ⚡ **Reactive by Design** - Fine-grained reactivity with immutable data
- 🔧 **Type Safety** - Full TypeScript integration with generated types
- 🌐 **Full-Stack Ready** - Support for both client-only and full-stack applications

## Quick Navigation

### 🚀 Start Here

- **[Quick Start Guide](./quick-start.md)** - Build your first component in minutes
- **[Installation Guide](./installation.md)** - Set up Jay in your project
- **[Core Concepts](./core-concepts.md)** - Understand Jay's fundamental principles
- **[Design Philosophy](./design-philosophy.md)** - Learn why Jay was built this way

### 📚 Next Steps

- **[Jay-HTML Format](../core/jay-html.md)** - Learn the extended HTML format
- **[Contract Files](../core/contract-files.md)** - Create reusable component contracts
- **[Component Development](../core/components.md)** - Build your first components
- **[Examples](../examples/basic.md)** - See working code patterns

## Choose Your Path

### For Designers

If you're a designer looking to integrate with development workflows:

1. **Start with [Core Concepts](./core-concepts.md)** - Understand how Jay bridges design and code
2. **Read [Design Philosophy](./design-philosophy.md)** - Learn about the contract-based approach
3. **Explore [Jay-HTML Format](../core/jay-html.md)** - See how designs are represented
4. **Check [Examples](../examples/basic.md)** - See how designs translate to working components

### For Developers

If you're a developer building with Jay:

1. **Follow [Quick Start Guide](./quick-start.md)** - Build your first component
2. **Set up [Installation](./installation.md)** - Configure your development environment
3. **Learn [Core Concepts](./core-concepts.md)** - Understand the framework architecture
4. **Master [Component Development](../core/components.md)** - Build production components

### For Teams

If you're working in a design-development team:

1. **Read [Design Philosophy](./design-philosophy.md)** - Understand the collaborative approach
2. **Study [Core Concepts](./core-concepts.md)** - Learn about contracts and separation of concerns
3. **Practice with [Quick Start](./quick-start.md)** - Build your first collaborative component
4. **Explore [Examples](../examples/basic.md)** - See team workflow patterns

## Prerequisites

Before getting started, ensure you have:

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Basic TypeScript knowledge** - [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- **Familiarity with HTML/CSS** - Standard web technologies
- **A code editor** - VS Code recommended

## Project Structure

A typical Jay project looks like this:

```
my-jay-project/
├── src/
│   ├── components/
│   │   ├── counter/
│   │   │   ├── counter.jay-html    # Design contract
│   │   │   └── counter.ts          # Component logic
│   │   └── ...
│   ├── pages/
│   │   └── ...
│   └── main.ts
├── public/
│   └── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Key Concepts to Understand

### 1. Contracts

Contracts define the interface between design and code:

- **View State** - Data that flows from component to UI
- **References** - Named UI elements for interaction
- **Variants** - Design variations and states

### 2. Component Types

Jay supports different component types:

- **Headfull Components** - Include both contract and UI design
- **Headless Components** - Define only the contract (reusable logic)

### 3. Rendering Phases

Jay Stack supports three rendering phases:

- **Slow Rendering** - Build time, static data
- **Fast Rendering** - Server time, dynamic data
- **Interactive Rendering** - Client time, user interactions

## Common Questions

### Is Jay production-ready?

Jay is currently **experimental**. While it's functional and well-architected, APIs may change as we gather feedback and iterate on the design.

### Can I use Jay with existing projects?

Yes! Jay can be added to existing projects. See the [Installation Guide](./installation.md) for details on integrating with different project types.

### How does Jay compare to React/Vue/Angular?

Jay is designed to solve different problems:

- **Design-to-code workflow** - Seamless integration between design tools and code
- **3rd party component safety** - Secure integration of external components
- **Contract-based architecture** - Type-safe interfaces between design and code

### Can I use Jay components in React?

Yes! Jay provides React integration through the `@jay-framework/4-react` package. See the [React Integration](../integration/react.md) guide.

### What design tools does Jay support?

Jay uses HTML as the design format, which means it can work with any design tool that can export HTML. The framework is designed to be tool-agnostic.

## Getting Help

### Documentation

- **Core Documentation** - Learn the fundamentals
- **Examples** - See working code patterns
- **API Reference** - Complete API documentation

### Community

- **GitHub Issues** - Report bugs and request features
- **Discussions** - Join community conversations
- **Design Log** - Explore architectural decisions

### Examples

- **Basic Examples** - Simple components and patterns
- **Advanced Examples** - Complex applications and workflows
- **Full-Stack Examples** - Server-side rendering and routing

## Next Steps

Ready to start building? Choose your path:

1. **[Quick Start Guide](./quick-start.md)** - Build your first component in minutes
2. **[Installation Guide](./installation.md)** - Set up your development environment
3. **[Core Concepts](./core-concepts.md)** - Understand the framework fundamentals
4. **[Examples](../examples/basic.md)** - Explore working code patterns

---

**Welcome to Jay!** We're excited to see what you'll build with the framework that bridges design and code.
