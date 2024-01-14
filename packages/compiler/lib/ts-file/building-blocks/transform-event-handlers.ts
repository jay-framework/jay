import ts from 'typescript';
import { FoundEventHandler } from './find-event-handler-functions';
import {
    TransformedEventHandlerByPattern,
    transformEventHandlerByPatternBlock,
} from './transform-event-handler-by-pattern';
import { CompiledPattern } from './compile-function-split-patterns';
import { transformEventHandlerCallStatement$Block } from './transform-event-handler-call$';

export interface TransformedEventHandler extends FoundEventHandler {
    wasEventHandlerTransformed: boolean;
    transformedEventHandler: ts.Node;
    transformedEventHandlerCallStatement: ts.Node;
    functionRepositoryFragment?: string;
}

export interface FunctionRepositoryFragment {
    handlerIndex: number,
    fragment: string
}

export class TransformedEventHandlers {
    private eventHandlers: Map<ts.Node, TransformedEventHandler[]>;
    private eventHandlerCallStatements: Map<ts.Node, TransformedEventHandler>;
    constructor(public readonly transformedEventHandlers: TransformedEventHandler[]) {
        this.eventHandlers = new Map<ts.Node, TransformedEventHandler[]>();
        this.eventHandlerCallStatements = new Map<ts.Node, TransformedEventHandler>();
        transformedEventHandlers.forEach((transformedEventHandler) => {
            this.eventHandlerCallStatements.set(
                transformedEventHandler.eventHandlerCallStatement,
                transformedEventHandler,
            );
            if (this.eventHandlers.has(transformedEventHandler.eventHandler))
                this.eventHandlers
                    .get(transformedEventHandler.eventHandler)
                    .push(transformedEventHandler);
            else
                this.eventHandlers.set(transformedEventHandler.eventHandler, [
                    transformedEventHandler,
                ]);
        });
    }

    hasEventHandler(node: ts.Node): boolean {
        return this.eventHandlers.has(node);
    }

    hasEventHandlerCallStatement(node: ts.Node): boolean {
        return this.eventHandlerCallStatements.has(node);
    }

    getTransformedEventHandlerCallStatement(node: ts.Node): TransformedEventHandler {
        return this.eventHandlerCallStatements.get(node);
    }

    getTransformedEventHandler(node: ts.Node): TransformedEventHandler[] {
        return this.eventHandlers.get(node);
    }

    getAllFunctionRepositoryFragments(): FunctionRepositoryFragment[] {
        return Array.from(this.eventHandlers.values()).map(transformEventHandlers =>
            ({
                fragment: transformEventHandlers[0].functionRepositoryFragment,
                handlerIndex: transformEventHandlers[0].handlerIndex
            }))
    }
}

export function transformEventHandlers(
    context: ts.TransformationContext,
    compiledPatterns: CompiledPattern[],
    factory: ts.NodeFactory,
    foundEventHandlers: FoundEventHandler[],
): TransformedEventHandler[] {
    let handlerToTransformedHandlers: Map<ts.Node, TransformedEventHandlerByPattern> = new Map();

    foundEventHandlers.forEach((foundEventHandler) => {
        if (!handlerToTransformedHandlers.has(foundEventHandler.eventHandler))
            handlerToTransformedHandlers.set(
                foundEventHandler.eventHandler,
                transformEventHandlerByPatternBlock(
                    context,
                    compiledPatterns,
                    factory,
                    foundEventHandler.eventHandler,
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
            const { transformedEventHandler, wasEventHandlerTransformed, functionRepositoryFragment } =
                handlerToTransformedHandlers.get(foundEventHandler.eventHandler);
            const transformedEventHandlerCallStatement = transformEventHandlerCallStatement$Block(
                context,
                factory,
                foundEventHandler,
            )(foundEventHandler.eventHandlerCallStatement);
            return {
                ...foundEventHandler,
                transformedEventHandler,
                wasEventHandlerTransformed,
                functionRepositoryFragment,
                transformedEventHandlerCallStatement: transformedEventHandlerCallStatement,
            };
        });
}
