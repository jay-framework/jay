import {Statement, TransformationContext} from "typescript";
import {codeToAst} from "../ts-utils/ts-compiler-utils";

export interface FunctionRepositoryCodeFragment {
    handlerCode: string;
    key: string;
}

export interface GeneratedFunctionRepository {
    hasFunctionRepository: boolean;
    functionRepository: Statement[]
}

export class FunctionRepositoryBuilder {
    public readonly fragments: Array<FunctionRepositoryCodeFragment> = [];
    public readonly consts: Array<string> = [];
    private nextIndex = 0;

    addFunction(handlerCode: string): string {
        if (!handlerCode)
            return undefined;
        const key = `${this.nextIndex++}`;
        this.fragments.push({key, handlerCode})
        return key
    }

    addConst(constCode: string) {
        if (!constCode)
            return;

        this.consts.push(constCode);
    }

    generate(context: TransformationContext): GeneratedFunctionRepository {
        if (this.fragments.length > 0) {
            let fragments = [...new Set(
                this.fragments
                    .map((_) => `'${_.key}': ${_.handlerCode}`))
            ]
                .join(',\n');

            let uniqueConstants = [...new Set(this.consts)];
            let constantsCodeFragment =
                uniqueConstants.length > 0 ? uniqueConstants.join('\n') + '\n\n' : '';

            let functionRepository = `${constantsCodeFragment}const funcRepository: FunctionsRepository = {\n${fragments}\n};`;

            return {
                functionRepository: codeToAst(functionRepository, context) as Statement[],
                hasFunctionRepository: true,
            };
        } else return { hasFunctionRepository: false, functionRepository: [] };
    }
}
