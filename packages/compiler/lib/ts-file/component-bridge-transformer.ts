import ts from 'typescript';
import { getModeFileExtension, RuntimeMode } from '../core/runtime-mode';
import { codeToAst, astToCode } from './ts-compiler-utils';
import { mkTransformer, SourceFileTransformerContext } from './mk-transformer';
import {
    findMakeJayComponentImport,
    findMakeJayComponentImportTransformerBlock,
} from './building-blocks/find-make-jay-component-import';
import {
    findComponentConstructorCallsBlock, MakeJayComponentConstructorCalls
} from './building-blocks/find-component-constructor-calls';
import { getImportName } from './extract-imports';
import { MAKE_JAY_COMPONENT } from '../core/constants';
import {findComponentConstructorsBlock} from "./building-blocks/find-component-constructors.ts";
import {findEventHandlersBlock} from "./building-blocks/find-event-handler-functions.ts";
import {compileFunctionSplitPatternsBlock} from "./building-blocks/compile-function-split-patterns.ts";
import {TransformedEventHandlers, transformEventHandlers} from "./building-blocks/transform-event-handlers.ts";

function transformVariableStatement(
    node: ts.VariableStatement,
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    componentConstructorCalls: MakeJayComponentConstructorCalls[],
) {
    let transformedConstructors = componentConstructorCalls.map(({ name, render }) => {
        return `${astToCode(name)} = makeJayComponentBridge(${astToCode(render)})`;
    });

    if (transformedConstructors.length > 0) {
        let declarationCode = `export const ${transformedConstructors.join(', ')}`;
        return codeToAst(declarationCode, context);
    } else return undefined;
}

function getRenderImportSpecifier(node: ts.ImportDeclaration): ts.ImportSpecifier | undefined {
    const namedBindings = node.importClause.namedBindings;
    switch (namedBindings?.kind) {
        case ts.SyntaxKind.NamedImports: {
            return namedBindings.elements.find((binding) => getImportName(binding) === 'render');
        }
        default:
            return undefined;
    }
}

function transformImport(
    node: ts.ImportDeclaration,
    factory: ts.NodeFactory,
    importerMode: RuntimeMode,
    context: ts.TransformationContext,
): ts.Node[] {
    if (ts.isStringLiteral(node.moduleSpecifier)) {
        if (findMakeJayComponentImport(MAKE_JAY_COMPONENT, node))
            return codeToAst(`import { makeJayComponentBridge } from 'jay-secure';`, context);
        const renderImportSpecifier = getRenderImportSpecifier(node);
        if (Boolean(renderImportSpecifier)) {
            const importModule = `${node.moduleSpecifier.text}${getModeFileExtension(
                true,
                importerMode,
            )}`;
            return codeToAst(
                `import { ${astToCode(renderImportSpecifier)} } from '${importModule}'`,
                context,
            );
        }
        return undefined;
    }
    return undefined;
}

interface ComponentBridgeTransformerConfig {
    importerMode: RuntimeMode;
    patterns: string[]
}

const mkVisitor = (
    factory: ts.NodeFactory,
    context: ts.TransformationContext,
    importerMode: RuntimeMode,
    componentConstructorCalls: MakeJayComponentConstructorCalls[],
) => {
    const visitor: ts.Visitor = (node) => {
        if (ts.isFunctionDeclaration(node)) return undefined;
        else if (ts.isInterfaceDeclaration(node)) return node;
        else if (ts.isImportDeclaration(node))
            return transformImport(node, factory, importerMode, context);
        else if (ts.isVariableStatement(node))
            return transformVariableStatement(node, factory, context, componentConstructorCalls);
        return ts.visitEachChild(node, visitor, context);
    };
    return visitor;
};

function mkSourceFileTransformer({
    factory,
    sourceFile,
    context,
    importerMode,
    patterns
}: SourceFileTransformerContext & ComponentBridgeTransformerConfig) {

    // find the event handlers
    let makeJayComponent_ImportName = findMakeJayComponentImportTransformerBlock(
        MAKE_JAY_COMPONENT,
        sourceFile,
    );

    let calls = findComponentConstructorCallsBlock(makeJayComponent_ImportName, sourceFile);
    let constructorExpressions = calls.map(({ comp }) => comp);
    let constructorDefinitions = findComponentConstructorsBlock(constructorExpressions, sourceFile);
    let foundEventHandlers = constructorDefinitions.flatMap((constructorDefinition) =>
        findEventHandlersBlock(constructorDefinition),
    );

    // compile patterns
    // todo extract the pattern compilation to a prior stage
    let compiledPatterns = compileFunctionSplitPatternsBlock(patterns);

    let transformedEventHandlers = new TransformedEventHandlers(
        transformEventHandlers(context, compiledPatterns.val, factory, foundEventHandlers),
    );

    return ts.visitEachChild(
        sourceFile,
        mkVisitor(factory, context, importerMode, calls),
        context,
    );
}

export function componentBridgeTransformer(
    importerMode: RuntimeMode,
    patterns: string[] = []
): (context: ts.TransformationContext) => ts.Transformer<ts.SourceFile> {
    return mkTransformer(mkSourceFileTransformer, { importerMode, patterns });
}
