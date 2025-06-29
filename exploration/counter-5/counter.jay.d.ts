import { JayElement } from '@jay-framework/runtime';
import { ElementEvents } from './ElementEvents';

interface ViewState {
    count: number;
}

interface Events {
    dec?: ElementEvents;
    inc?: ElementEvents;
    count?: ElementEvents;
}

export declare function render(viewState: ViewState, events: Events): JayElement<ViewState>;
