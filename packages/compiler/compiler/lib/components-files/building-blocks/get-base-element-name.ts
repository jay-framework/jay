import { WithValidations } from '@jay-framework/compiler-shared';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { SyntaxKind } = tsModule;

export function getBaseElementName<T extends { name: ts.BindingName }>(
    makeJayComponentName: string,
    componentConstructors: T[],
): WithValidations<string> {
    if (componentConstructors.length === 0) {
        return new WithValidations(undefined, [
            `Missing "${makeJayComponentName}" component constructor. Make sure it is exported as a const`,
        ]);
    }
    if (componentConstructors.length > 1) {
        return new WithValidations(undefined, [
            `Multiple "${makeJayComponentName}" component constructors found. Only one is allowed`,
        ]);
    }
    const { name } = componentConstructors[0];
    if (name.kind !== SyntaxKind.Identifier) {
        return new WithValidations(undefined, [
            `Component constructor initialized with "${makeJayComponentName}" is not exported as a const`,
        ]);
    }
    return new WithValidations((name as ts.Identifier).text);
}
