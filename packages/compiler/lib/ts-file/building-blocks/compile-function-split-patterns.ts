import ts, {
    isCallExpression,
    isExpressionStatement,
    isFunctionDeclaration,
    isPropertyAccessExpression,
    isReturnStatement
} from "typescript";
import {NameBindingResolver, Variable} from "./name-binding-resolver.ts";
import {mkTransformer} from "../mk-transformer.ts";
import {JayValidations, WithValidations} from "../../core/with-validations.ts";
import {astToCode} from "../ts-compiler-utils.ts";


export function compileFunctionSplitPatternsBlock(
    patterns: string[]
): WithValidations<Variable[]> {
    const validations: JayValidations = [];
    const compiledPatterns: Variable[] = [];

    patterns.forEach((pattern) => {
        let patternSourceFile = ts.createSourceFile(
            'dummy.ts',
            pattern,
            ts.ScriptTarget.Latest,
            false,
            ts.ScriptKind.TS,
        );

        const findPatternFunctions: ts.Visitor = (node) => {
            if (isFunctionDeclaration(node)) {
                if (node.parameters.length !== 1) {
                    validations.push('Event handler patterns must have a single handler parameter');
                    return node;
                }

                let nameBindingResolver = new NameBindingResolver();
                nameBindingResolver.addFunctionParams(node);

                node.body.statements.forEach((statement, index) => {
                    if (isReturnStatement(statement) && isPropertyAccessExpression(statement.expression)) {
                        compiledPatterns.push(nameBindingResolver.resolvePropertyAccessChain(statement.expression));
                    }
                    else if (isExpressionStatement(statement) &&
                        isCallExpression(statement.expression) &&
                        isPropertyAccessExpression(statement.expression.expression)) {
                        compiledPatterns.push(nameBindingResolver.resolvePropertyAccessChain(statement.expression.expression));
                    }
                    else
                        validations.push(`unsupported statement, at pattern [${node.name?.text}] statement [${index}]: `, astToCode(statement))
                })

            }
            return node;
        }

        ts.transform(patternSourceFile, [mkTransformer(({context, sourceFile}) => {
            ts.visitEachChild(patternSourceFile, findPatternFunctions, context)
            return sourceFile;
        })])

        // find imports
        // find functions
        // validate only usage of function parameters, single statement functions, no conditions.
    });

    return new WithValidations(compiledPatterns, validations);
}