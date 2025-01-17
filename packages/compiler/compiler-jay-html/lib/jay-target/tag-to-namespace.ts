import { JayHtmlNamespace } from './jay-html-source-file';
import { Import, ImportName, Imports } from 'jay-compiler-shared';

const SVG_TAGS = new Set([
    'animate',
    'animateMotion',
    'animateTransform',
    'circle',
    'clipPath',
    'defs',
    'desc',
    'ellipse',
    'feBlend',
    'feColorMatrix',
    'feComponentTransfer',
    'feComposite',
    'feConvolveMatrix',
    'feDiffuseLighting',
    'feDisplacementMap',
    'feDistantLight',
    'feDropShadow',
    'feFlood',
    'feFuncA',
    'feFuncB',
    'feFuncG',
    'feFuncR',
    'feGaussianBlur',
    'feImage',
    'feMerge',
    'feMergeNode',
    'feMorphology',
    'feOffset',
    'fePointLight',
    'feSpecularLighting',
    'feSpotLight',
    'feTile',
    'feTurbulence',
    'filter',
    'foreignObject',
    'g',
    'image',
    'line',
    'linearGradient',
    'marker',
    'mask',
    'metadata',
    'mpath',
    'path',
    'pattern',
    'polygon',
    'polyline',
    'radialGradient',
    'rect',
    'set',
    'stop',
    'svg',
    'switch',
    'symbol',
    'text',
    'textPath',
    'title',
    'tspan',
    'use',
    'view',
]);
const MATH_ML_TAGS = new Set([
    'math',
    'maction',
    'annotation',
    'annotation-xml',
    'menclose',
    'merror',
    'mfenced',
    'mfrac',
    'mi',
    'mmultiscripts',
    'mn',
    'mo',
    'mover',
    'mpadded',
    'mphantom',
    'mprescripts',
    'mroot',
    'mrow',
    'ms',
    'semantics',
    'mspace',
    'msqrt',
    'mstyle',
    'msub',
    'msup',
    'msubsup',
    'mtable',
    'mtd',
    'mtext',
    'mtr',
    'munder',
    'munderover',
]);

const SVG = 'http://www.w3.org/2000/svg';
const MathML = 'http://www.w3.org/1998/Math/MathML';

const e: MappedNamespaceReference = { elementFunction: 'e', import: Import.element };
const svg: MappedNamespaceReference = { elementFunction: 'svg', import: Import.svgElement };
const ml: MappedNamespaceReference = { elementFunction: 'ml', import: Import.mathMlElement };
const de: MappedNamespaceReference = { elementFunction: 'de', import: Import.dynamicElement };
const dsvg: MappedNamespaceReference = {
    elementFunction: 'dsvg',
    import: Import.svgDynamicElement,
};
const dml: MappedNamespaceReference = {
    elementFunction: 'dml',
    import: Import.mathMLDynamicElement,
};

export interface MappedNamespaceReference {
    elementFunction: string;
    import: ImportName;
}

export interface MappedNamespace extends MappedNamespaceReference {
    tag: string;
}

export function tagToNamespace(
    tag: string,
    dynamic: boolean,
    namespaces: JayHtmlNamespace[],
): MappedNamespace {
    if (tag.match(/\w:\w/)) {
        const prefix = tag.split(':')[0];
        const suffix = tag.split(':')[1];
        const namespace = namespaces.find((_) => _.prefix === prefix).namespace;
        if (namespace) {
            if (namespace === SVG) return { tag: suffix, ...(dynamic ? dsvg : svg) };
            else if (namespace === MathML) return { tag: suffix, ...(dynamic ? dml : ml) };
        }
    }
    if (SVG_TAGS.has(tag)) return { tag, ...(dynamic ? dsvg : svg) };
    else if (MATH_ML_TAGS.has(tag)) return { tag, ...(dynamic ? dml : ml) };
    else return { tag, ...(dynamic ? de : e) };
}
