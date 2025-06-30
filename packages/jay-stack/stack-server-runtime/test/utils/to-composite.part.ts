import { DevServerPagePart } from '../../lib/load-page-parts';
import { CompositePart } from '@jay-framework/stack-client-runtime';

export function toCompositePart(parts: DevServerPagePart[]): CompositePart[] {
    return parts.map((_) => ({
        comp: _.compDefinition.comp,
        key: _.key,
        contextMarkers: _.compDefinition.clientContexts,
    }));
}
