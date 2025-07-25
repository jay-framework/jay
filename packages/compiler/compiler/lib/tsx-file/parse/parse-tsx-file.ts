import { JayTsxSourceFile } from '../jsx-block';
import { createRequire } from 'module';
import type * as ts from 'typescript';
const require = createRequire(import.meta.url);
const tsModule = require('typescript') as typeof ts;
const { isObjectLiteralExpression, ScriptKind } = tsModule;
import { WithValidations } from '@jay-framework/compiler-shared';
import {
    getImportByName,
    parseImportLinks,
} from '../../components-files/building-blocks/parse-import-links';
import { createTsSourceFileFromSource } from '../../components-files/building-blocks/create-ts-source-file-from-source';
import { getBaseElementName } from '../../components-files/building-blocks/get-base-element-name';
import { JAY_COMPONENT, MAKE_JAY_TSX_COMPONENT } from '@jay-framework/compiler-shared';
import { findComponentConstructorsBlock } from '../../components-files/building-blocks/find-component-constructors';
import { findFunctionExpressionReturnStatements } from '../../components-files/building-blocks/find-function-expression-return-statements';
import { getObjectPropertiesMap } from '../../components-files/building-blocks/get-object-properties-map';
import { parseJsx } from './parse-jsx';
import {
    findComponentConstructorCallsBlock,
    FindComponentConstructorType,
} from '../../components-files/building-blocks/find-component-constructor-calls';
import { SourceFileBindingResolver } from '../../components-files/basic-analyzers/source-file-binding-resolver';

export function parseTsxFile(filename: string, source: string): WithValidations<JayTsxSourceFile> {
    const sourceFile = createTsSourceFileFromSource(filename, source, ScriptKind.TSX);

    const imports = parseImportLinks(sourceFile);
    const makeJayTsxComponentImport = getImportByName(
        imports,
        JAY_COMPONENT,
        MAKE_JAY_TSX_COMPONENT,
    );

    if (!Boolean(makeJayTsxComponentImport))
        return new WithValidations(undefined, [`Missing ${MAKE_JAY_TSX_COMPONENT} import`]);

    const makeJayTsxComponent_ImportName =
        makeJayTsxComponentImport.as || makeJayTsxComponentImport.name;
    const bindingResolver = new SourceFileBindingResolver(sourceFile);
    const componentConstructors = findComponentConstructorCallsBlock(
        FindComponentConstructorType.makeJayTsxComponent,
        bindingResolver,
        sourceFile,
    );

    const { val: baseElementName, validations: baseElementNameValidations } = getBaseElementName(
        makeJayTsxComponent_ImportName,
        componentConstructors,
    );
    if (baseElementNameValidations.length > 0)
        return new WithValidations(undefined, baseElementNameValidations);

    // supporting only one component constructor for now, checked in getBaseElementName
    const componentConstructor = componentConstructors[0];
    const constructorDefinition = findComponentConstructorsBlock(
        [componentConstructor.comp],
        sourceFile,
    )[0];

    const constructorReturnStatements =
        findFunctionExpressionReturnStatements(constructorDefinition);
    if (constructorReturnStatements.length === 0)
        return new WithValidations(undefined, [
            'Missing return statement in component constructor',
        ]);
    constructorReturnStatements.forEach((statement) => {
        if (!isObjectLiteralExpression(statement.expression))
            return new WithValidations(undefined, [
                'Component constructor has to return an object literal',
            ]);
    });

    const returnStatementsProperties = constructorReturnStatements.map((statement) =>
        getObjectPropertiesMap(statement.expression as ts.ObjectLiteralExpression),
    );
    returnStatementsProperties.forEach((statementProperties) => {
        if (!statementProperties.render)
            return new WithValidations(undefined, [
                'Component constructor has to return an object with a render function',
            ]);
    });

    const renderExpressions = returnStatementsProperties.map((statement) => statement.render);

    const renderedJsxes = renderExpressions.map((renderExpression) => parseJsx(renderExpression));
    renderedJsxes.forEach(({ validations }) => {
        if (validations.length > 0) return new WithValidations(undefined, validations);
    });

    return new WithValidations({
        imports,
        baseElementName,
        jsxBlock: renderedJsxes[0], // TODO support multiple bodies
    } as JayTsxSourceFile);
}
