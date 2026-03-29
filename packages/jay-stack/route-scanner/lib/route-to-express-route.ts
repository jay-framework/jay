import { JayRoute, JayRouteParamType } from './route-scanner';

export function routeToExpressRoute(route: JayRoute): string {
    const parts: string[] = [];
    for (const segment of route.segments) {
        if (typeof segment === 'string') {
            parts.push('/' + segment);
        } else if (segment.type === JayRouteParamType.single) {
            parts.push('/:' + segment.name);
        } else if (segment.type === JayRouteParamType.optional) {
            // Express 5 / path-to-regexp v8: optional segments use braces
            parts.push('{/:' + segment.name + '}');
        } else {
            // Express 5 / path-to-regexp v8: wildcard uses *name
            parts.push('/*' + segment.name);
        }
    }
    return parts.length === 0 ? '/' : parts.join('');
}
