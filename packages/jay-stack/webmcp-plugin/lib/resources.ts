import type { AutomationAPI } from '@jay-framework/runtime-automation';
import type { ResourceDescriptor } from './webmcp-types';

/**
 * state://viewstate — Complete current ViewState as JSON.
 */
export function makeViewStateResource(automation: AutomationAPI): ResourceDescriptor {
    return {
        uri: 'state://viewstate',
        name: 'Page ViewState',
        description: 'Current page state as JSON — all data displayed on the page',
        mimeType: 'application/json',
        read() {
            const { viewState } = automation.getPageState();
            return {
                contents: [
                    {
                        uri: 'state://viewstate',
                        text: JSON.stringify(viewState, null, 2),
                        mimeType: 'application/json',
                    },
                ],
            };
        },
    };
}

/**
 * state://interactions — Available interactions, serialized with string coordinates.
 */
export function makeInteractionsResource(automation: AutomationAPI): ResourceDescriptor {
    return {
        uri: 'state://interactions',
        name: 'Available Interactions',
        description: 'Interactive elements on the page, grouped by ref name',
        mimeType: 'application/json',
        read() {
            const { interactions } = automation.getPageState();
            const serialized = interactions.map((group) => ({
                refName: group.refName,
                ...(group.description ? { description: group.description } : {}),
                items: group.items.map((i) => ({
                    coordinate: i.coordinate.join('/'),
                    elementType: i.element.constructor.name,
                    events: i.events,
                })),
            }));
            return {
                contents: [
                    {
                        uri: 'state://interactions',
                        text: JSON.stringify(serialized, null, 2),
                        mimeType: 'application/json',
                    },
                ],
            };
        },
    };
}
