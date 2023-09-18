import {WithValidations} from "./with-validations";
import {tsExtractTypes} from "./ts-extract-types";

import {JayComponentType} from "./jay-file-types";


export function generateRefsFile(filepath: string): WithValidations<string> {
  let types = tsExtractTypes(filepath)

  let componentTypes: Array<JayComponentType> = types.filter(_ => _ instanceof JayComponentType) as Array<JayComponentType>;

  let relativeFilename = filepath.substring(filepath.lastIndexOf('/')+1)
  let compImports = componentTypes.map(comp => comp.name).join(', ');


  let compDeclarations = componentTypes.map(comp => {
    let componentType = `${comp.name}ComponentType`;
    let refMembers = comp.api.map(api => {
      if (api.isEvent)
        return `${api.property}: EventEmitter<EventTypeFrom<${componentType}['${api.property}']>, ParentVS>`
      else
        return `${api.property}: ${componentType}['${api.property}']`
    })
    let refsMembers = comp.api
        .filter(api => api.isEvent)
        .map(api => {
          return `${api.property}: EventEmitter<EventTypeFrom<${componentType}['${api.property}']>, ParentVS>`
        })
    return `export type ${comp.name}ComponentType = ReturnType<typeof ${comp.name}>;

export interface ${comp.name}Ref<ParentVS> extends JayComponent<
  PropsFrom<${componentType}>,
  ViewStateFrom<${componentType}>,
  ElementFrom<${componentType}>>{
  ${refMembers.join('\n  ')}
}

export interface ${comp.name}Refs<ParentVS> extends ComponentCollectionProxy<ParentVS, ${comp.name}Ref<ParentVS>> {
  ${refsMembers.join('\n  ')}
}`
  })

  let code = `import {JayComponent, EventEmitter, ComponentCollectionProxy, EventTypeFrom, PropsFrom, ViewStateFrom, ElementFrom} from 'jay-runtime';
import {${compImports}} from "./${relativeFilename}";

${compDeclarations.join('\n\n')}`
  return new WithValidations<string>(code, []);
}