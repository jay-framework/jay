import ts from 'typescript';
import { createTsSourceFile } from '../../test-utils/ts-source-utils';
import { getObjectPropertiesMap } from '../../../lib/components-files/building-blocks/get-object-properties-map';

describe('getObjectPropertiesMap', () => {
    function getMap(sourceFile: ts.SourceFile) {
        return getObjectPropertiesMap(
            (
                (sourceFile.statements[0] as ts.ExpressionStatement)
                    .expression as ts.ParenthesizedExpression
            ).expression as ts.ObjectLiteralExpression,
        );
    }

    const sourceFile = createTsSourceFile(`
({
    render: () => (<div>{count()}</div>),
    props: { a: 1 },
    ['asString']: 1,
    [() => ({})]: 1,
})
        `);

    it('returns object properties map by name', async () => {
        const propertyMap = getMap(sourceFile);

        expect(Object.keys(propertyMap)).toEqual(['render', 'props', 'asString']);
        expect(propertyMap.render.kind).toEqual(ts.SyntaxKind.ArrowFunction);
        expect(propertyMap.props.kind).toEqual(ts.SyntaxKind.ObjectLiteralExpression);
    });
});
