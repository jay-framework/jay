export interface FunctionRepositoryCodeFragment {
    handlerCode: string;
    key: string;
}

export class GeneratedFunctionRepository {
    constructor(
        public readonly hasFunctionRepository: boolean,
        public readonly functionRepository: string,
    ) {}

    map(mapper: (value: string) => string) {
        return new GeneratedFunctionRepository(
            this.hasFunctionRepository,
            mapper(this.functionRepository),
        );
    }
}

export class FunctionRepositoryBuilder {
    public readonly fragments: Array<FunctionRepositoryCodeFragment> = [];
    public readonly consts: Array<string> = [];
    private nextIndex = 0;

    addFunction(handlerCode: string): string {
        if (!handlerCode) return undefined;
        const key = `${this.nextIndex++}`;
        this.fragments.push({ key, handlerCode });
        return key;
    }

    addConst(constCode: string) {
        if (!constCode) return;

        this.consts.push(constCode);
    }

    generate(): GeneratedFunctionRepository {
        if (this.fragments.length > 0) {
            let fragments = [
                ...new Set(this.fragments.map((_) => `'${_.key}': ${_.handlerCode}`)),
            ].join(',\n');

            let uniqueConstants = [...new Set(this.consts)];
            let constantsCodeFragment =
                uniqueConstants.length > 0 ? uniqueConstants.join('\n') + '\n\n' : '';

            let functionRepository = `${constantsCodeFragment}const funcRepository: FunctionsRepository = {\n${fragments}\n};`;

            return new GeneratedFunctionRepository(true, functionRepository);
        } else
            return new GeneratedFunctionRepository(
                false,
                'const funcRepository: FunctionsRepository = {}',
            );
    }

    generateGlobalFile(): GeneratedFunctionRepository {
        return this.generate().map(
            (_) => `import {FunctionsRepository} from "jay-secure";

export ${_}`,
        );
    }
}
