import ts, {
    Expression,
    isBinaryExpression,
    isCallExpression, isDecorator,
    isExpressionStatement,
    isFunctionDeclaration, isIdentifier,
    isPropertyAccessExpression,
    isReturnStatement,
    SourceFile,
    SyntaxKind,
} from 'typescript';
import {flattenVariable,} from './name-binding-resolver';
import {mkTransformer} from '../mk-transformer';
import {JayValidations, WithValidations} from '../../core/with-validations';
import {astToCode} from '../ts-compiler-utils';
import {SourceFileBindingResolver} from "./source-file-binding-resolver.ts";

export enum CompilePatternType {
    RETURN,
    CALL,
    CHAINABLE_CALL,
    ASSIGNMENT
}

export type CompilePatternVarType = string;

export enum JayTargetEnv {
    main,
    any,
    sandbox
}

/**
 * decorator to define running environment for compiler patterns.
 * Only used by the compiler below
 * @param env
 * @constructor
 */
export function JayPattern(env: JayTargetEnv) {
    return function (target) {
        return target
    }
}

export interface CompiledPattern {
    patternType: CompilePatternType;
    leftSidePath: string[];
    leftSideType: CompilePatternVarType,
    callArgumentTypes?: CompilePatternVarType[]
    returnType?: CompilePatternVarType,
    targetEnv: JayTargetEnv
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
                let targetEnv = JayTargetEnv.main;
                node.modifiers && node.modifiers.forEach(modifier => {
                    if (isDecorator(modifier) &&
                        isCallExpression(modifier.expression) &&
                        isIdentifier(modifier.expression.expression) &&
                        (modifier.expression.expression.text === 'JayPattern') &&
                        (modifier.expression.arguments.length === 1) &&
                        isPropertyAccessExpression(modifier.expression.arguments[0]) &&
                        isIdentifier(modifier.expression.arguments[0].expression) &&
                        modifier.expression.arguments[0].expression.text === 'JayTargetEnv' &&
                        modifier.expression.arguments[0].name.text === 'any')
                        targetEnv = JayTargetEnv.any;
                })

                node.body.statements.forEach((statement, index) => {

                    let patternType: CompilePatternType;
                    let leftHandSide: Expression;
                    if (
                        isReturnStatement(statement) &&
                        isPropertyAccessExpression(statement.expression)
                    ) {
                        patternType = CompilePatternType.RETURN;
                        leftHandSide = statement.expression
                    } else if (isReturnStatement(statement) &&
                        isCallExpression(statement.expression) &&
                        isPropertyAccessExpression(statement.expression.expression) &&
                        node.type) {
                        patternType = CompilePatternType.CHAINABLE_CALL;
                        leftHandSide = statement.expression.expression
                    } else if (isExpressionStatement(statement) &&
                        isCallExpression(statement.expression) &&
                        isPropertyAccessExpression(statement.expression.expression)) {
                        patternType = CompilePatternType.CALL;
                        leftHandSide = statement.expression.expression
                    } else if (isExpressionStatement(statement) &&
                        isBinaryExpression(statement.expression) &&
                        isPropertyAccessExpression(statement.expression.left) &&
                        (statement.expression.operatorToken.kind === SyntaxKind.EqualsToken) &&
                        isIdentifier(statement.expression.right)) {
                        patternType = CompilePatternType.ASSIGNMENT;
                        leftHandSide = statement.expression.left;
                    }

                    if (patternType !== undefined) {
                        let resolvedLeftHandSide = flattenVariable(
                            sourceFileBinding.findBindingResolver(statement)
                                .resolvePropertyAccessChain(leftHandSide),
                        );

                        // validate resolvedLeftHandSide is the first parameter

                        compiledPatterns.push({
                            patternType: patternType,
                            leftSidePath: resolvedLeftHandSide.path,
                            leftSideType: sourceFileBinding.explainType(node.parameters[0].type),
                            returnType: sourceFileBinding.explainType(node.type),
                            callArgumentTypes: node.parameters.slice(1).map(param =>
                                sourceFileBinding.explainType(param.type)),
                            targetEnv
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
    });
    return new WithValidations(compiledPatterns, validations);
}
