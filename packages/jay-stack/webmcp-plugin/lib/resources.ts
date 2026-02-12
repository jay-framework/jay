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
 * state://interactions — Available interactions grouped by ref name.
 */
export function makeInteractionsResource(automation: AutomationAPI): ResourceDescriptor {
    return {
        uri: 'state://interactions',
        name: 'Available Interactions',
        description: 'Interactive elements on the page, grouped by ref name',
        mimeType: 'application/json',
        read() {
            const { interactions } = automation.getPageState();
            return {
                contents: [
                    {
                        uri: 'state://interactions',
                        text: JSON.stringify(interactions, null, 2),
                        mimeType: 'application/json',
                    },
                ],
            };
        },
    };
}
