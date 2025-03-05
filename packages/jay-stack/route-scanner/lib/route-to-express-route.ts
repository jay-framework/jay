import {JayRoute, JayRouteParamType} from "./route-scanner";


export function routeToExpressRoute(route: JayRoute) {
    return '/' + route.segments.map(segment => {
        if (typeof segment === 'string')
            return segment
        else {
            if (segment.type === JayRouteParamType.single)
                return `:${segment.name}`
            else if (segment.type === JayRouteParamType.optional)
                return `:${segment.name}?`
            else
                return `:${segment.name}*`
        }
    }).join('/');
}