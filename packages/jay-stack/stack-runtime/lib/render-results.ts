import {ClientError4xx, PartialRender, Redirect3xx, ServerError5xx} from "./jay-stack-types";


export function serverError5xx(status: number): ServerError5xx {
    return {
        kind: "ServerError",
        status
    }
}

export function clientError4xx(status: number): ClientError4xx {
    return {
        kind: "ClientError",
        status
    }
}

export function notFound(): ClientError4xx {
    return clientError4xx(404)
}

export function redirect3xx(status: number, location: string): Redirect3xx {
    return {
        kind: "redirect",
        status,
        location
    }
}

export function partialRender<ViewState extends object, CarryForward>(
    render: Partial<ViewState>, carryForward: CarryForward
): PartialRender<ViewState, CarryForward> {
    return {kind: "PartialRender", render, carryForward}
}