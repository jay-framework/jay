import ts from 'typescript';
import { JsxBlock } from '../jsx-block';

export function parseOpeningElement(
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    jsxBlock: JsxBlock = new JsxBlock(),
): JsxBlock {
    const tagName = node.tagName.getText();
    const attributeTexts = node.attributes.properties.map((attribute) =>
        parseAttribute(attribute, jsxBlock),
    );
    if (!jsxBlock.isValid()) return jsxBlock;

    const elementText = [
        '<',
        tagName,
        attributeTexts.length > 0 ? ' ' : '',
        attributeTexts.join(' '),
        ts.isJsxSelfClosingElement(node) ? '/' : '',
        '>',
    ].join('');
    return jsxBlock.append({ htmlFragments: [elementText] });
}

function parseAttribute(attribute: ts.JsxAttributeLike, jsxBlock: JsxBlock): string | undefined {
    const key = attribute.name.getText();

    // TODO: support spread attributes
    if (!ts.isJsxAttribute(attribute)) {
        jsxBlock.addValidation(`Unsupported spread attribute: ${attribute.getText()}`);
        return;
    }

    if (ts.isStringLiteral(attribute.initializer)) {
        const value = attribute.initializer.getText();
        return `${key}=${value}`;
    }

    if (ts.isJsxExpression(attribute.initializer)) {
        const expression = attribute.initializer.expression;
        if (ts.isBinaryExpression(expression)) {
            return `${key}={_memo_${jsxBlock.addMemo(expression)}()}`;
        }

        if (ts.isArrowFunction(expression)) {
            return `ref="_ref_${jsxBlock.addRef(expression)}"`;
        }
    }

    jsxBlock.addValidation(`Unsupported attribute: ${attribute.getText()}`);
}
