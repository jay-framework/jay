import { FoundEventHandler } from './find-event-handler-functions';
import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';

const { isTypeReferenceNode } = tsBridge;
import {
    ImportFromModuleResolvedType,
    SourceFileBindingResolver,
} from '../basic-analyzers/source-file-binding-resolver';
export function isFirstParamJayEvent(
    eventHandler: ts.FunctionLikeDeclarationBase,
    bindingResolver: SourceFileBindingResolver,
) {
    if (eventHandler.parameters.length > 0 && eventHandler.parameters[0].type) {
        const explainedType = bindingResolver.explainType(eventHandler.parameters[0].type);
        if (
            isTypeReferenceNode(eventHandler.parameters[0].type) &&
            eventHandler.parameters[0].type.typeArguments?.length === 2 &&
            explainedType instanceof ImportFromModuleResolvedType &&
            explainedType.module === '@jay-framework/runtime' &&
            explainedType.path.length === 1 &&
            explainedType.path[0] === 'JayEvent'
        )
            return true;
    }
    return false;
}

export function filterEventHandlersToHaveJayEventType(
    foundEventHandlers: FoundEventHandler[],
    bindingResolver: SourceFileBindingResolver,
): FoundEventHandler[] {
    return foundEventHandlers.filter((foundEventHandler) => {
        const eventHandler = foundEventHandler.eventHandler;
        return isFirstParamJayEvent(eventHandler, bindingResolver);
    });
}
