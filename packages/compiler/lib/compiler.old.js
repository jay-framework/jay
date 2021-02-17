const {parse, NodeType} = require('node-html-parser');
const yaml = require('js-yaml');

const root = parse(`
<html>
    <head>
        <script type="application/yaml-jay">
data:
    text: string

example:
    text: 'hello world'
        </script>
    </head>
    <body>{rergr} {text}</body>
</html>
`);

console.log(root.firstChild.structure);
console.log(root.structure);

const types = root.querySelectorAll('[type="application/yaml-jay"]');
console.log(types, types[0].text)

let yy = yaml.load(types[0].text);

console.log(yy);

function generateInputDefinition(schema, name) {
  let inputDefinition = `interface ${name} {`;
  for (let key in schema) {
    inputDefinition += `\n  ${key}: ${schema[key]}`;
  }
  inputDefinition += '\n}';
  return inputDefinition;
}

const parseText = /{(.+?)}/g
function generateRenderFunction(body, inputVar, inputType) {
  let renderFunc = `export default function render(${inputVar}: ${inputType}) {\n`;
  
  function transformNode(node, currentVar) {
    if (node.nodeType === NodeType.ELEMENT_NODE) {
      let children = node.childNodes.map(child => transformNode(child, currentVar))
      return `h('${node.tagName}', {}, [${children.join(', ')}])`;
    }
    else if (node.nodeType === NodeType.TEXT_NODE) {
      let isTemplateString = false;
      let templateString = node.text.replace(parseText, (fullMatch,group1) => {
        isTemplateString = true;
        // todo validate against type
        return `\${vs.${group1}}`;
      })

      if (!isTemplateString)
        return `'${node.text}'`
      else {
        // todo add import dt
        return `dt(${currentVar}, vs => \`${templateString}\`)`;
      }

    }
  }

  let returnStatement = `  return ${transformNode(body, inputVar)}\n`;

  return renderFunc + returnStatement + '}';
}

let x = generateInputDefinition(yy.data, 'ViewState')
console.log(x);

const body = root.querySelector('body');
let y = generateRenderFunction(body, 'viewState', 'ViewState')
console.log(y);

