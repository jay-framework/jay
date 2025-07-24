import { FoundEventHandler } from './find-event-handler-functions';
import type * as ts from 'typescript';
import {
    TransformedEventHandlerByPattern,
    analyzeEventHandlerByPatternBlock,
} from './analyze-event-handler-by-pattern';
import { analyzeEventHandlerCallStatement$Block } from './analyze-event-handler-call$';
import { SourceFileBindingResolver } from '../basic-analyzers/source-file-binding-resolver';
import { SourceFileStatementAnalyzer } from '../basic-analyzers/scoped-source-file-statement-analyzer';
import { FunctionRepositoryBuilder } from './function-repository-builder';

export interface TransformedEventHandler extends FoundEventHandler {
    wasEventHandlerTransformed: boolean;
    transformedEventHandler: ts.Node;
    transformedEventHandlerCallStatement: ts.Node;
}

export function analyzedEventHandlersToReplaceMap(
    transformedEventHandlers: TransformedEventHandler[],
): Map<ts.Node, ts.Node> {
    const map = new Map<ts.Node, ts.Node>();
    transformedEventHandlers.forEach((_) => {
        map.set(_.eventHandlerCallStatement, _.transformedEventHandlerCallStatement);
        map.set(_.eventHandler, _.transformedEventHandler);
    });
    return map;
}

export function analyzeEventHandlers(
    context: ts.TransformationContext,
    bindingResolver: SourceFileBindingResolver,
    analyzer: SourceFileStatementAnalyzer,
    factory: ts.NodeFactory,
    foundEventHandlers: FoundEventHandler[],
    functionsRepository: FunctionRepositoryBuilder,
): TransformedEventHandler[] {
    let handlerToTransformedHandlers: Map<ts.Node, TransformedEventHandlerByPattern> = new Map();

    foundEventHandlers.forEach((foundEventHandler) => {
        if (!handlerToTransformedHandlers.has(foundEventHandler.eventHandler))
            handlerToTransformedHandlers.set(
                foundEventHandler.eventHandler,
                analyzeEventHandlerByPatternBlock(
                    context,
                    bindingResolver,
                    analyzer,
                    factory,
                    foundEventHandler.eventHandler,
                    functionsRepository,
                ),
            );
    });

    return foundEventHandlers
        .filter(
            (foundEventHandler) =>
                handlerToTransformedHandlers.get(foundEventHandler.eventHandler)
                    .wasEventHandlerTransformed,
        )
        .map((foundEventHandler) => {
            const { transformedEventHandler, wasEventHandlerTransformed, handlerKey } =
                handlerToTransformedHandlers.get(foundEventHandler.eventHandler);
            const transformedEventHandlerCallStatement = analyzeEventHandlerCallStatement$Block(
                context,
                factory,
                handlerKey,
            )(foundEventHandler.eventHandlerCallStatement);
            return {
                ...foundEventHandler,
                transformedEventHandler,
                wasEventHandlerTransformed,
                // functionRepositoryFragment,
                transformedEventHandlerCallStatement: transformedEventHandlerCallStatement,
            };
        });
}
