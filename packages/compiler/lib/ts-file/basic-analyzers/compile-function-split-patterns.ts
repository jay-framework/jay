import ts, {
    Expression,
    isBinaryExpression,
    isCallExpression,
    isDecorator,
    isExpressionStatement,
    isFunctionDeclaration,
    isIdentifier,
    isNewExpression,
    isPropertyAccessExpression,
    isReturnStatement,
    isSpreadElement,
    NodeArray,
    SourceFile,
    SyntaxKind,
} from 'typescript';
import {
    flattenVariable,
    isGlobalVariableRoot,
    isImportModuleVariableRoot,
    isParamVariableRoot
} from './name-binding-resolver';
import {mkTransformer} from '../ts-utils/mk-transformer';
import {JayValidations, WithValidations} from '../../core/with-validations';
import {astToCode} from '../ts-utils/ts-compiler-utils';
import {ResolvedType, SourceFileBindingResolver, SpreadResolvedType} from './source-file-binding-resolver';
import {isIdentifierOrPropertyAccessExpression} from "./typescript-extras";

export enum CompilePatternType {
    RETURN,
    CALL,
    CHAINABLE_CALL,
    ASSIGNMENT_LEFT_SIDE,
    KNOWN_VARIABLE_READ,
    CONST_READ,
    INLINE_ARROW_FUNCTION
}

export function areCompatiblePatternTypes(type1: CompilePatternType, type2: CompilePatternType) {
    if (type1 === type2)
        return true;
    if (type1 === CompilePatternType.CALL && type2 === CompilePatternType.CHAINABLE_CALL) return true;
    return type1 === CompilePatternType.CHAINABLE_CALL && type2 === CompilePatternType.CALL;

}

export const KNOWN_VARIABLE_READ_NAME = 'knownVariableReadPattern';
export const CONST_READ_NAME = 'knownVariableReadPattern';
export const INLINE_ARROW_FUNCTION = 'inlineArrowFunctionPattern';

export enum JayTargetEnv {
    main,
    any,
    sandbox,
}

export function jayTargetEnvName(jayTargetEnv: JayTargetEnv) {
    let names = Object.values(JayTargetEnv).filter((_) => typeof _ === 'string');
    let values = Object.values(JayTargetEnv).filter((_) => typeof _ === 'number');
    return names[values.indexOf(jayTargetEnv)];
}

export function intersectJayTargetEnv(a: JayTargetEnv, b: JayTargetEnv) {
    if (a === b && a === JayTargetEnv.any) return JayTargetEnv.any;
    if (
        (a === JayTargetEnv.main && b === JayTargetEnv.main) ||
        (a === JayTargetEnv.main && b === JayTargetEnv.any) ||
        (a === JayTargetEnv.any && b === JayTargetEnv.main)
    )
        return JayTargetEnv.main;
    else return JayTargetEnv.sandbox;
}

/**
 * decorator to define running environment for compiler patterns.
 * Only used by the compiler below
 * @param env
 * @constructor
 */
export function JayPattern(env: JayTargetEnv) {
    return function (target) {
        return target;
    };
}

export interface CompiledPattern {
    patternType: CompilePatternType;
    leftSidePath: string[];
    leftSideType: ResolvedType;
    callArgumentTypes?: ResolvedType[];
    returnType: ResolvedType;
    targetEnvForStatement: JayTargetEnv;
    name: string;
}

function extractArgumentType(argument: ts.Expression, sourceFileBinding: SourceFileBindingResolver, node: ts.FunctionDeclaration): ResolvedType {
    if (isIdentifierOrPropertyAccessExpression(argument)) {
        const explainedArgument = flattenVariable(sourceFileBinding.explain(argument));
        if (isParamVariableRoot(explainedArgument.root)) {
            const paramIndex = explainedArgument.root.paramIndex
            return sourceFileBinding.explainType(node.parameters[paramIndex].type)
        }
    }
    if (isSpreadElement(argument)) {
        return new SpreadResolvedType(extractArgumentType(argument.expression, sourceFileBinding, node));
    }
    return undefined;
}

function extractArgumentTypes(callArgs: NodeArray<ts.Expression>, sourceFileBinding: SourceFileBindingResolver, node: ts.FunctionDeclaration) {
    return callArgs.map(argument => {
        return extractArgumentType(argument, sourceFileBinding, node);
    })
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
                let declaredTargetEnv = JayTargetEnv.main;
                node.modifiers &&
                    node.modifiers.forEach((modifier) => {
                        if (
                            isDecorator(modifier) &&
                            isCallExpression(modifier.expression) &&
                            isIdentifier(modifier.expression.expression) &&
                            modifier.expression.expression.text === 'JayPattern' &&
                            modifier.expression.arguments.length === 1 &&
                            isPropertyAccessExpression(modifier.expression.arguments[0]) &&
                            isIdentifier(modifier.expression.arguments[0].expression) &&
                            modifier.expression.arguments[0].expression.text === 'JayTargetEnv' &&
                            modifier.expression.arguments[0].name.text === 'any'
                        )
                            declaredTargetEnv = JayTargetEnv.any;
                    });

                let name = node.name.text;

                node.body.statements.forEach((statement, index) => {
                    let patternTargetEnv = declaredTargetEnv;
                    let patternType: CompilePatternType;
                    let leftHandSide: Expression;
                    let callArgumentTypes: ResolvedType[] = [];
                    if (
                        isReturnStatement(statement) &&
                        isIdentifierOrPropertyAccessExpression(statement.expression)
                    ) {
                        patternType = CompilePatternType.RETURN;
                        leftHandSide = statement.expression;
                        patternTargetEnv = JayTargetEnv.any;
                    } else if (
                        isReturnStatement(statement) &&
                        isCallExpression(statement.expression) &&
                        isIdentifierOrPropertyAccessExpression(statement.expression.expression) &&
                        node.type
                    ) {
                        patternType = CompilePatternType.CHAINABLE_CALL;
                        leftHandSide = statement.expression.expression;
                        callArgumentTypes = extractArgumentTypes(statement.expression.arguments, sourceFileBinding, node)
                    } else if (
                        isReturnStatement(statement) &&
                        isNewExpression(statement.expression) &&
                        isIdentifierOrPropertyAccessExpression(statement.expression.expression)
                    ) {
                        patternType = CompilePatternType.CHAINABLE_CALL;
                        leftHandSide = statement.expression.expression;
                        callArgumentTypes = extractArgumentTypes(statement.expression.arguments, sourceFileBinding, node)
                    } else if (
                        isExpressionStatement(statement) &&
                        isCallExpression(statement.expression) &&
                        isIdentifierOrPropertyAccessExpression(statement.expression.expression)
                    ) {
                        patternType = CompilePatternType.CALL;
                        leftHandSide = statement.expression.expression;
                        callArgumentTypes = extractArgumentTypes(statement.expression.arguments, sourceFileBinding, node)
                    } else if (
                        isExpressionStatement(statement) &&
                        isBinaryExpression(statement.expression) &&
                        isPropertyAccessExpression(statement.expression.left) &&
                        statement.expression.operatorToken.kind === SyntaxKind.EqualsToken &&
                        isIdentifier(statement.expression.right)
                    ) {
                        patternType = CompilePatternType.ASSIGNMENT_LEFT_SIDE;
                        leftHandSide = statement.expression.left;
                        callArgumentTypes = [extractArgumentType(statement.expression.right, sourceFileBinding, node)]
                    }

                    let resolvedLeftHandSide = flattenVariable(
                        sourceFileBinding
                            .findBindingResolver(statement)
                            .resolvePropertyAccessChain(leftHandSide),
                    );

                    let leftSideType: ResolvedType = undefined;
                    if (isParamVariableRoot(resolvedLeftHandSide.root)) {
                        const paramIndex = resolvedLeftHandSide.root.paramIndex;
                        // validate resolvedLeftHandSide is the first parameter
                        leftSideType = sourceFileBinding.explainType(node.parameters[paramIndex].type)
                    }
                    else if (isGlobalVariableRoot(resolvedLeftHandSide.root))
                        leftSideType = sourceFileBinding.globalType(resolvedLeftHandSide.root);
                    else if (isImportModuleVariableRoot(resolvedLeftHandSide.root))
                        leftSideType = sourceFileBinding.explainFlattenedVariableType(resolvedLeftHandSide)
                    if (patternType !== undefined && leftSideType !== undefined) {

                        compiledPatterns.push({
                            patternType: patternType,
                            leftSidePath: resolvedLeftHandSide.path,
                            leftSideType: leftSideType,
                            returnType: sourceFileBinding.explainType(node.type),
                            callArgumentTypes: callArgumentTypes,
                            targetEnvForStatement: patternTargetEnv,
                            name,
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
