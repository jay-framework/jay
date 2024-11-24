import { WithValidations } from '../generation-utils/with-validations';
import { analyzeExportedTypes } from './basic-analyzers/analyze-exported-types';

import { ResolveTsConfigOptions } from './ts-utils/resolve-ts-config';
import { JayComponentType } from '../generation-utils/jay-type';

export function generateComponentRefsDefinitionFile(
    filepath: string,
    options?: ResolveTsConfigOptions,
): WithValidations<string> {
    let types = analyzeExportedTypes(filepath, options);

    let componentTypes: Array<JayComponentType> = types.filter(
        (_) => _ instanceof JayComponentType,
    ) as Array<JayComponentType>;

    let relativeFilename = filepath.substring(filepath.lastIndexOf('/') + 1);
    let compImports = componentTypes.map((comp) => comp.name).join(', ');

    let compDeclarations = componentTypes.map((comp) => {
        let componentType = `${comp.name}ComponentType`;
        let refsMembers = comp.api
            .filter((api) => api.isEvent)
            .map((api) => {
                return `${api.property}: EventEmitter<EventTypeFrom<${componentType}<ParentVS>['${api.property}']>, ParentVS>`;
            });

        let refsMembersRendered =
            refsMembers.length === 0
                ? '{}'
                : `{
  ${refsMembers.join('\n  ')}
}`;

        return `export type ${componentType}<ParentVS> = ReturnType<typeof ${comp.name}<ParentVS>>;

export interface ${comp.name}Refs<ParentVS> extends ComponentCollectionProxy<ParentVS, ${componentType}<ParentVS>> ${refsMembersRendered}`;
    });

    let code = `import {EventEmitter, ComponentCollectionProxy, EventTypeFrom} from 'jay-runtime';
import {${compImports}} from "./${relativeFilename}";

${compDeclarations.join('\n\n')}`;
    return new WithValidations<string>(code, []);
}
