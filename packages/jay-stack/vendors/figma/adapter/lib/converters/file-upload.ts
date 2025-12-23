import { InterchangeFileUpload } from '@jay-framework/figma-interchange';
import { sanitizeHtmlId } from '../utils/html-utils';
import { generateFileUploadLabelStyles } from '../styles/style-generator';

export function convertFileUploadNode(node: InterchangeFileUpload, depth: number): string {
    const indent = '  '.repeat(depth);
    const childIndent = '  '.repeat(depth + 1);

    const inputId = sanitizeHtmlId(node.name, node.id);
    const labelId = `${inputId}_label`;

    // Build attributes for the hidden input
    const inputAttrs: string[] = [`id="${inputId}"`, 'type="file"'];
    if (node.multiple) {
        inputAttrs.push('multiple');
    }
    if (node.webkitdirectory) {
        inputAttrs.push('webkitdirectory');
    }

    // Hidden input style
    const hiddenInputStyle =
        'position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; z-index: 2';

    // Generate styles for the label (visible button)
    const labelStyles = generateFileUploadLabelStyles(node);

    const labelText = node.labelText || 'Choose File';

    return (
        `${indent}<div style="position: relative;">\n` +
        `${childIndent}<input ${inputAttrs.join(' ')} style="${hiddenInputStyle}" />\n` +
        `${childIndent}<label for="${inputId}" id="${labelId}" style="${labelStyles}">${labelText}</label>\n` +
        `${indent}</div>`
    );
}
