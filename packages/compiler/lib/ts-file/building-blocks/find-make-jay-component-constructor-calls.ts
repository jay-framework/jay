import ts from 'typescript';
import {
    findComponentConstructorCalls,
    findComponentConstructorCallsBlock,
    MapComponentConstructorCall,
} from './find-component-constructor-calls';

export interface MakeJayComponentConstructorCalls {
    render: ts.Expression;
    comp: ts.Expression;
    name: ts.BindingName;
}

const mapMakeJayComponentConstructorCall: MapComponentConstructorCall<
    MakeJayComponentConstructorCalls
> = (initializer, name) => ({
    render: initializer.arguments[0],
    comp: initializer.arguments[1],
    name,
});

export function findMakeJayComponentConstructorCalls(
    initializerName: string,
    node: ts.Node,
): MakeJayComponentConstructorCalls[] {
    return findComponentConstructorCalls(initializerName, mapMakeJayComponentConstructorCall, node);
}

export function findMakeJayComponentConstructorCallsBlock(
    initializerName: string,
    sourceFile: ts.SourceFile,
): MakeJayComponentConstructorCalls[] {
    return findComponentConstructorCallsBlock(
        initializerName,
        mapMakeJayComponentConstructorCall,
        sourceFile,
    );
}
