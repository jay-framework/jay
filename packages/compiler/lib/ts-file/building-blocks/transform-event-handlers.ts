import ts, {} from "typescript";
import {FoundEventHandler} from "./find-event-handler-functions.ts";
import {SplitEventHandler, splitEventHandlerByPatternBlock} from "./split-event-handler-by-pattern.ts";
import {CompiledPattern} from "./compile-function-split-patterns.ts";
import {addEventHandlerCallStatementBlock} from "./add-event-handler-call$.ts";

export interface TransformedEventHandler extends FoundEventHandler {
    wasEventHandlerTransformed: boolean;
    transformedEventHandler: ts.Node;
    transformedEventHandlerCallStatement: ts.Node;
}

export class TransformedEventHandlers {
    private eventHandlers: Map<ts.Node, TransformedEventHandler[]>;
    private eventHandlerCallStatements: Map<ts.Node, TransformedEventHandler>;
    constructor(public readonly transformedEventHandlers: TransformedEventHandler[]) {
        this.eventHandlers = new Map<ts.Node, TransformedEventHandler[]>();
        this.eventHandlerCallStatements = new Map<ts.Node, TransformedEventHandler>()
        transformedEventHandlers.forEach(transformedEventHandler => {
            this.eventHandlerCallStatements.set(transformedEventHandler.eventHandlerCallStatement, transformedEventHandler)
            if (this.eventHandlers.has(transformedEventHandler.eventHandler))
                this.eventHandlers.get(transformedEventHandler.eventHandler).push(transformedEventHandler)
            else
                this.eventHandlers.set(transformedEventHandler.eventHandler, [transformedEventHandler])
        })
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
        return this.eventHandlers.get(node)
    }
}

export function transformEventHandlers(context: ts.TransformationContext,
                                       compiledPatterns: CompiledPattern[],
                                       factory: ts.NodeFactory,
                                       foundEventHandlers: FoundEventHandler[]): TransformedEventHandler[] {

    let handlerToTransformedHandlers: Map<ts.Node, SplitEventHandler> = new Map();

    foundEventHandlers.forEach(foundEventHandler => {
        if (!handlerToTransformedHandlers.has(foundEventHandler.eventHandler))
            handlerToTransformedHandlers.set(foundEventHandler.eventHandler,
                splitEventHandlerByPatternBlock(context, compiledPatterns, factory, foundEventHandler.eventHandler))
    })

    return foundEventHandlers
        .filter(foundEventHandler => handlerToTransformedHandlers.get(foundEventHandler.eventHandler).wasEventHandlerTransformed)
        .map(foundEventHandler => {
            const {transformedEventHandler, wasEventHandlerTransformed} = handlerToTransformedHandlers.get(foundEventHandler.eventHandler)
            const transformedEventHandlerCallStatement = addEventHandlerCallStatementBlock(context, factory, foundEventHandler)(foundEventHandler.eventHandlerCallStatement)
            return {
                ...foundEventHandler,
                transformedEventHandler,
                wasEventHandlerTransformed,
                transformedEventHandlerCallStatement: transformedEventHandlerCallStatement
            }
        })
}