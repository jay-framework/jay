The Jay Compiler
===

The Jay Compiler transforms a Jay File into different outputs - 
1. Runtime File
2. Typescript definition File
3. [todo] test driver file

The compiler API
---

The compiler API is very simple at this stage

```typescript
export declare type JayValidations = Array<string>;
export declare class WithValidations<T> {
    val?: T;
    validations: JayValidations;
    constructor(val: T | undefined, validations: JayValidations);
    map<R>(func: (T: any) => R): WithValidations<R>;
    flatMap<R>(func: (T: any) => WithValidations<R>): WithValidations<R>;
}

export declare function generateDefinitionFile(html: string): WithValidations<string>;

export declare function generateRuntimeFile(html: string): WithValidations<string>;
```

The compiler inner working
--

The compiler works in a few stages
1. parsing a Jay file using an HTML parser
1. parsing the data part as yaml
1. parse expressions using PEG.js custom parser
1. generate runtime file
1. generate typescript definition file