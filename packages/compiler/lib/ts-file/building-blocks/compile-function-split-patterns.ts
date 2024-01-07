import ts, {
    isCallExpression,
    isExpressionStatement,
    isFunctionDeclaration,
    isPropertyAccessExpression,
    isReturnStatement,
} from 'typescript';
import {
    FlattenedAccessChain,
    flattenVariable,
    NameBindingResolver,
    Variable,
} from './name-binding-resolver.ts';
import { mkTransformer } from '../mk-transformer.ts';
import { JayValidations, WithValidations } from '../../core/with-validations.ts';
import { astToCode } from '../ts-compiler-utils.ts';

export enum CompilePatternType {
    RETURN,
    CALL,
}

export interface CompiledPattern {
    accessChain: FlattenedAccessChain;
    type: CompilePatternType;
    paramIndex: number;
}

export function compileFunctionSplitPatternsBlock(
    patterns: string[],
): WithValidations<CompiledPattern[]> {
    const validations: JayValidations = [];
    const compiledPatterns: CompiledPattern[] = [];

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
                    if (
                        isReturnStatement(statement) &&
                        isPropertyAccessExpression(statement.expression)
                    ) {
                        let resolvedVariable = flattenVariable(
                            nameBindingResolver.resolvePropertyAccessChain(statement.expression),
                        );
                        compiledPatterns.push({
                            accessChain: resolvedVariable,
                            type: CompilePatternType.RETURN,
                            paramIndex: node.parameters.findIndex(
                                (param) => param === resolvedVariable.root,
                            ),
                        });
                    } else if (
                        isExpressionStatement(statement) &&
                        isCallExpression(statement.expression) &&
                        isPropertyAccessExpression(statement.expression.expression)
                    ) {
                        let resolvedVariable = flattenVariable(
                            nameBindingResolver.resolvePropertyAccessChain(
                                statement.expression.expression,
                            ),
                        );
                        compiledPatterns.push({
                            accessChain: resolvedVariable,
                            type: CompilePatternType.CALL,
                            paramIndex: node.parameters.findIndex(
                                (param) => param === resolvedVariable.root,
                            ),
                        });
                    } else
                        validations.push(
                            `unsupported statement, at pattern [${node.name?.text}] statement [${index}]: `,
                            astToCode(statement),
                        );
                });
            }
            return node;
        };

        ts.transform(patternSourceFile, [
            mkTransformer(({ context, sourceFile }) => {
                ts.visitEachChild(patternSourceFile, findPatternFunctions, context);
                return sourceFile;
            }),
        ]);

        // find imports
        // find functions
        // validate only usage of function parameters, single statement functions, no conditions.
    });

    return new WithValidations(compiledPatterns, validations);
}
