import ts, {
    isCallExpression,
    isExpressionStatement,
    isFunctionDeclaration,
    isPropertyAccessExpression,
    isReturnStatement, ParameterDeclaration, SourceFile,
} from 'typescript';
import {
    FlattenedAccessChain,
    flattenVariable,
    NameBindingResolver,
} from './name-binding-resolver';
import { mkTransformer } from '../mk-transformer';
import { JayValidations, WithValidations } from '../../core/with-validations';
import { astToCode } from '../ts-compiler-utils';
import {SourceFileBindingResolver} from "./source-file-binding-resolver.ts";

export enum CompilePatternType {
    RETURN,
    CALL,
    CHAINABLE_CALL,
    ASSIGNMENT
}

export interface CompiledPattern {
    accessChain: FlattenedAccessChain;
    type: CompilePatternType;
    arguments: FlattenedAccessChain[]
}

export function compileFunctionSplitPatternsBlock(
    patternFiles: SourceFile[],
): WithValidations<CompiledPattern[]> {
    const validations: JayValidations = [];
    const compiledPatterns: CompiledPattern[] = [];

    patternFiles.forEach((patternsFile) => {

        const sourceFileBinding = new SourceFileBindingResolver(patternsFile);
        const findPatternFunctions: ts.Visitor = (node) => {
            if (isFunctionDeclaration(node)) {
                // if (node.parameters.length !== 1) {
                //     validations.push('Event handler patterns must have a single handler parameter');
                //     return node;
                // }

                // let nameBindingResolver = new NameBindingResolver();
                // nameBindingResolver.addFunctionParams(node);

                node.body.statements.forEach((statement, index) => {
                    if (
                        isReturnStatement(statement) &&
                        isPropertyAccessExpression(statement.expression)
                    ) {

                        let resolvedVariable = flattenVariable(
                            sourceFileBinding.findBindingResolver(statement)
                                .resolvePropertyAccessChain(statement.expression),
                        );
                        compiledPatterns.push({
                            accessChain: resolvedVariable,
                            type: CompilePatternType.RETURN,
                            arguments: []
                        });
                    } else if (
                        isReturnStatement(statement) &&
                        isCallExpression(statement.expression) &&
                        isPropertyAccessExpression(statement.expression.expression) &&
                        node.type
                    ) {
                        let resolvedVariable = flattenVariable(
                            sourceFileBinding.findBindingResolver(statement)
                                .resolvePropertyAccessChain(
                                    statement.expression.expression,
                            ),
                        );
                        compiledPatterns.push({
                            accessChain: resolvedVariable,
                            type: CompilePatternType.CHAINABLE_CALL,
                            arguments: statement.expression.arguments.map(expression => flattenVariable(
                                sourceFileBinding.findBindingResolver(statement)
                                    .resolvePropertyAccessChain(
                                        expression,
                                ),
                            ))
                        });
                    } else if (
                        isExpressionStatement(statement) &&
                        isCallExpression(statement.expression) &&
                        isPropertyAccessExpression(statement.expression.expression)
                    ) {
                        let resolvedVariable = flattenVariable(
                            sourceFileBinding.findBindingResolver(statement).resolvePropertyAccessChain(
                                statement.expression.expression,
                            ),
                        );
                        compiledPatterns.push({
                            accessChain: resolvedVariable,
                            type: CompilePatternType.CALL,
                            arguments: []
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

        ts.transform(patternsFile, [
            mkTransformer(({ context, sourceFile }) => {
                ts.visitEachChild(patternsFile, findPatternFunctions, context);
                return sourceFile;
            }),
        ]);

        // find imports
        // find functions
        // validate only usage of function parameters, single statement functions, no conditions.
    });
    return new WithValidations(compiledPatterns, validations);
}
