import * as ts from 'typescript';
import {
    hasExtension,
    JAY_QUERY_MAIN_SANDBOX,
    JAY_QUERY_WORKER_SANDBOX,
} from 'jay-compiler-shared';
import { JayImportLink, JayImportName } from 'jay-compiler-shared';
import {
    extractImportDeclarations,
    getImportName,
    getImportSpecifiers,
} from '../ts-utils/extract-imports';
import { JayUnknown } from 'jay-compiler-shared';

export function parseImportLinks(sourceFile: ts.SourceFile): JayImportLink[] {
    const importDeclarations = extractImportDeclarations(sourceFile).filter((importDeclaration) =>
        ts.isStringLiteral(importDeclaration.moduleSpecifier),
    );
    const importLinks = importDeclarations.map<JayImportLink>((importDeclaration) => {
        const module = (importDeclaration.moduleSpecifier as ts.StringLiteral).text;
        const sandbox =
            hasExtension(module, JAY_QUERY_MAIN_SANDBOX) ||
            hasExtension(module, JAY_QUERY_WORKER_SANDBOX);
        const names = getJayImportNames(importDeclaration);
        return { module, names, sandbox };
    });
    return importLinks;
}

export function getImportByName(
    importLinks: JayImportLink[],
    component: string,
    name: string,
): JayImportName | undefined {
    return importLinks
        .filter((link) => link.module === component)
        .flatMap((link) => link.names)
        .find((names) => names.name === name);
}

function getJayImportNames(importDeclaration: ts.ImportDeclaration): JayImportName[] {
    const importSpecifiers = getImportSpecifiers(importDeclaration);
    return (
        importSpecifiers?.map<JayImportName>((importSpecifier) => {
            const as = importSpecifier.propertyName?.text ? importSpecifier.name.text : undefined;
            const name = getImportName(importSpecifier);
            return {
                name,
                ...(as && { as }),
                type: JayUnknown,
            };
        }) || []
    );
}
