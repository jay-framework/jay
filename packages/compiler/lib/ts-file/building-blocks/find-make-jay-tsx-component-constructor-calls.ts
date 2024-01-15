import ts from 'typescript';
import {
    findComponentConstructorCallsBlock,
    MapComponentConstructorCall,
} from './find-component-constructor-calls';

export interface MakeJayTsxComponentConstructorCalls {
    comp: ts.Expression;
    name: ts.BindingName;
}

const mapMakeJayTsxComponentConstructorCall: MapComponentConstructorCall<
    MakeJayTsxComponentConstructorCalls
> = (initializer, name) => ({
    comp: initializer.arguments[0],
    name,
});

export function findMakeJayTsxComponentConstructorCallsBlock(
    initializerName: string,
    sourceFile: ts.SourceFile,
): MakeJayTsxComponentConstructorCalls[] {
    return findComponentConstructorCallsBlock(
        initializerName,
        mapMakeJayTsxComponentConstructorCall,
        sourceFile,
    );
}
