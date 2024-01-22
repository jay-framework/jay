import { JayTsxFile } from '../core/jay-file-types';
import { WithValidations } from '../core/with-validations';
import { getImportByName, parseImportLinks } from '../ts-file/parse-jay-file/parse-import-links';
import { createTsSourceFileFromSource } from '../ts-file/building-blocks/create-ts-source-file-from-source';
import { getBaseElementName } from '../ts-file/building-blocks/get-base-element-name';
import { JAY_COMPONENT, MAKE_JAY_TSX_COMPONENT } from '../core/constants';
import { findComponentConstructorsBlock } from '../ts-file/building-blocks/find-component-constructors';
import { findFunctionExpressionReturnStatements } from '../ts-file/building-blocks/find-function-expression-return-statements';
import { findMakeJayTsxComponentConstructorCallsBlock } from '../ts-file/building-blocks/find-make-jay-tsx-component-constructor-calls';
import ts from 'typescript';
import { getObjectPropertiesMap } from '../ts-file/building-blocks/get-object-properties-map';
import { parseJsx } from './parse-jsx';

export function parseTsxFile(filename: string, source: string): WithValidations<JayTsxFile> {
    const sourceFile = createTsSourceFileFromSource(filename, source, ts.ScriptKind.TSX);

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
    const componentConstructors = findMakeJayTsxComponentConstructorCallsBlock(
        makeJayTsxComponent_ImportName,
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
        if (!ts.isObjectLiteralExpression(statement.expression))
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
    } as JayTsxFile);
}
