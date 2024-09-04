import { Coordinate, JayComponent, JayEvent, JayEventHandler } from './element-types';

/** DOM element references **/
export type JayNativeFunction<ElementType extends HTMLElement, ViewState, Result> = (
    elem: ElementType,
    viewState: ViewState,
) => Result;
export interface JayNativeEventBuilder<ViewState, EventData> {
    then(handler: (event: JayEvent<EventData, ViewState>) => void): void;
}

export interface GlobalJayEvents<ViewState> {
    onabort(handler: JayEventHandler<UIEvent, ViewState, void>): void;
    onabort$<EventData>(
        handler: JayEventHandler<UIEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onanimationcancel(handler: JayEventHandler<AnimationEvent, ViewState, void>): void;
    onanimationcancel$<EventData>(
        handler: JayEventHandler<AnimationEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onanimationend(handler: JayEventHandler<AnimationEvent, ViewState, void>): void;
    onanimationend$<EventData>(
        handler: JayEventHandler<AnimationEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onanimationiteration(handler: JayEventHandler<AnimationEvent, ViewState, void>): void;
    onanimationiteration$<EventData>(
        handler: JayEventHandler<AnimationEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onanimationstart(handler: JayEventHandler<AnimationEvent, ViewState, void>): void;
    onanimationstart$<EventData>(
        handler: JayEventHandler<AnimationEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onauxclick(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    onauxclick$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onblur(handler: JayEventHandler<FocusEvent, ViewState, void>): void;
    onblur$<EventData>(
        handler: JayEventHandler<FocusEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    oncanplay(handler: JayEventHandler<Event, ViewState, void>): void;
    oncanplay$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    oncanplaythrough(handler: JayEventHandler<Event, ViewState, void>): void;
    oncanplaythrough$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onchange(handler: JayEventHandler<Event, ViewState, void>): void;
    onchange$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onclick(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    onclick$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onclose(handler: JayEventHandler<Event, ViewState, void>): void;
    onclose$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    oncontextmenu(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    oncontextmenu$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    oncuechange(handler: JayEventHandler<Event, ViewState, void>): void;
    oncuechange$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ondblclick(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    ondblclick$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ondrag(handler: JayEventHandler<DragEvent, ViewState, void>): void;
    ondrag$<EventData>(
        handler: JayEventHandler<DragEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ondragend(handler: JayEventHandler<DragEvent, ViewState, void>): void;
    ondragend$<EventData>(
        handler: JayEventHandler<DragEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ondragenter(handler: JayEventHandler<DragEvent, ViewState, void>): void;
    ondragenter$<EventData>(
        handler: JayEventHandler<DragEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ondragleave(handler: JayEventHandler<DragEvent, ViewState, void>): void;
    ondragleave$<EventData>(
        handler: JayEventHandler<DragEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ondragover(handler: JayEventHandler<DragEvent, ViewState, void>): void;
    ondragover$<EventData>(
        handler: JayEventHandler<DragEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ondragstart(handler: JayEventHandler<DragEvent, ViewState, void>): void;
    ondragstart$<EventData>(
        handler: JayEventHandler<DragEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ondrop(handler: JayEventHandler<DragEvent, ViewState, void>): void;
    ondrop$<EventData>(
        handler: JayEventHandler<DragEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ondurationchange(handler: JayEventHandler<Event, ViewState, void>): void;
    ondurationchange$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onemptied(handler: JayEventHandler<Event, ViewState, void>): void;
    onemptied$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onended(handler: JayEventHandler<Event, ViewState, void>): void;
    onended$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    //  onerror: OnErrorEventHandler;
    onfocus(handler: JayEventHandler<FocusEvent, ViewState, void>): void;
    onfocus$<EventData>(
        handler: JayEventHandler<FocusEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onformdata(handler: JayEventHandler<void, ViewState, void>): void;
    onformdata$<EventData>(
        handler: JayEventHandler<any, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ongotpointercapture(handler: JayEventHandler<PointerEvent, ViewState, void>): void;
    ongotpointercapture$<EventData>(
        handler: JayEventHandler<PointerEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    oninput(handler: JayEventHandler<Event, ViewState, void>): void;
    oninput$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    oninvalid(handler: JayEventHandler<Event, ViewState, void>): void;
    oninvalid$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onkeydown(handler: JayEventHandler<KeyboardEvent, ViewState, void>): void;
    onkeydown$<EventData>(
        handler: JayEventHandler<KeyboardEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onkeypress(handler: JayEventHandler<KeyboardEvent, ViewState, void>): void;
    onkeypress$<EventData>(
        handler: JayEventHandler<KeyboardEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onkeyup(handler: JayEventHandler<KeyboardEvent, ViewState, void>): void;
    onkeyup$<EventData>(
        handler: JayEventHandler<KeyboardEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onload(handler: JayEventHandler<Event, ViewState, void>): void;
    onload$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onloadeddata(handler: JayEventHandler<Event, ViewState, void>): void;
    onloadeddata$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onloadedmetadata(handler: JayEventHandler<Event, ViewState, void>): void;
    onloadedmetadata$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onloadstart(handler: JayEventHandler<Event, ViewState, void>): void;
    onloadstart$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onlostpointercapture(handler: JayEventHandler<PointerEvent, ViewState, void>): void;
    onlostpointercapture$<EventData>(
        handler: JayEventHandler<PointerEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onmousedown(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    onmousedown$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onmouseenter(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    onmouseenter$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onmouseleave(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    onmouseleave$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onmousemove(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    onmousemove$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onmouseout(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    onmouseout$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onmouseover(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    onmouseover$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onmouseup(handler: JayEventHandler<MouseEvent, ViewState, void>): void;
    onmouseup$<EventData>(
        handler: JayEventHandler<MouseEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onpause(handler: JayEventHandler<Event, ViewState, void>): void;
    onpause$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onplay(handler: JayEventHandler<Event, ViewState, void>): void;
    onplay$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onplaying(handler: JayEventHandler<Event, ViewState, void>): void;
    onplaying$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onpointercancel(handler: JayEventHandler<PointerEvent, ViewState, void>): void;
    onpointercancel$<EventData>(
        handler: JayEventHandler<PointerEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onpointerdown(handler: JayEventHandler<PointerEvent, ViewState, void>): void;
    onpointerdown$<EventData>(
        handler: JayEventHandler<PointerEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onpointerenter(handler: JayEventHandler<PointerEvent, ViewState, void>): void;
    onpointerenter$<EventData>(
        handler: JayEventHandler<PointerEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onpointerleave(handler: JayEventHandler<PointerEvent, ViewState, void>): void;
    onpointerleave$<EventData>(
        handler: JayEventHandler<PointerEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onpointermove(handler: JayEventHandler<PointerEvent, ViewState, void>): void;
    onpointermove$<EventData>(
        handler: JayEventHandler<PointerEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onpointerout(handler: JayEventHandler<PointerEvent, ViewState, void>): void;
    onpointerout$<EventData>(
        handler: JayEventHandler<PointerEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onpointerover(handler: JayEventHandler<PointerEvent, ViewState, void>): void;
    onpointerover$<EventData>(
        handler: JayEventHandler<PointerEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onpointerup(handler: JayEventHandler<PointerEvent, ViewState, void>): void;
    onpointerup$<EventData>(
        handler: JayEventHandler<PointerEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onprogress(handler: JayEventHandler<ProgressEvent, ViewState, void>): void;
    onprogress$<EventData>(
        handler: JayEventHandler<ProgressEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onratechange(handler: JayEventHandler<Event, ViewState, void>): void;
    onratechange$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onreset(handler: JayEventHandler<Event, ViewState, void>): void;
    onreset$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onresize(handler: JayEventHandler<UIEvent, ViewState, void>): void;
    onresize$<EventData>(
        handler: JayEventHandler<UIEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onscroll(handler: JayEventHandler<Event, ViewState, void>): void;
    onscroll$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onseeked(handler: JayEventHandler<Event, ViewState, void>): void;
    onseeked$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onseeking(handler: JayEventHandler<Event, ViewState, void>): void;
    onseeking$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onselect(handler: JayEventHandler<Event, ViewState, void>): void;
    onselect$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onselectionchange(handler: JayEventHandler<Event, ViewState, void>): void;
    onselectionchange$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onselectstart(handler: JayEventHandler<Event, ViewState, void>): void;
    onselectstart$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onstalled(handler: JayEventHandler<Event, ViewState, void>): void;
    onstalled$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onsubmit(handler: JayEventHandler<Event, ViewState, void>): void;
    onsubmit$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onsuspend(handler: JayEventHandler<Event, ViewState, void>): void;
    onsuspend$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontimeupdate(handler: JayEventHandler<Event, ViewState, void>): void;
    ontimeupdate$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontoggle(handler: JayEventHandler<Event, ViewState, void>): void;
    ontoggle$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;

    ontouchcancel(handler: JayEventHandler<TouchEvent, ViewState, void>): void;
    ontouchcancel$<EventData>(
        handler: JayEventHandler<TouchEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontouchend(handler: JayEventHandler<TouchEvent, ViewState, void>): void;
    ontouchend$<EventData>(
        handler: JayEventHandler<TouchEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontouchmove(handler: JayEventHandler<TouchEvent, ViewState, void>): void;
    ontouchmove$<EventData>(
        handler: JayEventHandler<TouchEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontouchstart(handler: JayEventHandler<TouchEvent, ViewState, void>): void;
    ontouchstart$<EventData>(
        handler: JayEventHandler<TouchEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;

    ontransitioncancel(handler: JayEventHandler<TransitionEvent, ViewState, void>): void;
    ontransitioncancel$<EventData>(
        handler: JayEventHandler<TransitionEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontransitionend(handler: JayEventHandler<TransitionEvent, ViewState, void>): void;
    ontransitionend$<EventData>(
        handler: JayEventHandler<TransitionEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontransitionrun(handler: JayEventHandler<TransitionEvent, ViewState, void>): void;
    ontransitionrun$<EventData>(
        handler: JayEventHandler<TransitionEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontransitionstart(handler: JayEventHandler<TransitionEvent, ViewState, void>): void;
    ontransitionstart$<EventData>(
        handler: JayEventHandler<TransitionEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;

    onvolumechange(handler: JayEventHandler<Event, ViewState, void>): void;
    onvolumechange$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontransitionstart(handler: JayEventHandler<Event, ViewState, void>): void;
    ontransitionstart$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontransitionstart(handler: JayEventHandler<Event, ViewState, void>): void;
    ontransitionstart$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontransitionstart(handler: JayEventHandler<Event, ViewState, void>): void;
    ontransitionstart$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    ontransitionstart(handler: JayEventHandler<Event, ViewState, void>): void;
    ontransitionstart$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;

    onvolumechange(handler: JayEventHandler<Event, ViewState, void>): void;
    onvolumechange$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onwaiting(handler: JayEventHandler<Event, ViewState, void>): void;
    onwaiting$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onwebkitanimationend(handler: JayEventHandler<Event, ViewState, void>): void;
    onwebkitanimationend$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onwebkitanimationiteration(handler: JayEventHandler<Event, ViewState, void>): void;
    onwebkitanimationiteration$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onwebkitanimationstart(handler: JayEventHandler<Event, ViewState, void>): void;
    onwebkitanimationstart$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onwebkittransitionend(handler: JayEventHandler<Event, ViewState, void>): void;
    onwebkittransitionend$<EventData>(
        handler: JayEventHandler<Event, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
    onwheel(handler: JayEventHandler<WheelEvent, ViewState, void>): void;
    onwheel$<EventData>(
        handler: JayEventHandler<WheelEvent, ViewState, EventData>,
    ): JayNativeEventBuilder<ViewState, EventData>;
}

export interface HTMLElementCollectionProxyTarget<ViewState, ElementType extends HTMLElement> {
    addEventListener<E extends Event>(
        type: string,
        handler: JayEventHandler<E, ViewState, any>,
        options?: boolean | AddEventListenerOptions,
    );
    removeEventListener<E extends Event>(
        type: string,
        handler: JayEventHandler<E, ViewState, any>,
        options?: EventListenerOptions | boolean,
    );

    find(
        predicate: (t: ViewState, c: Coordinate) => boolean,
    ): HTMLNativeExec<ViewState, ElementType> | undefined;
    map<ResultType>(
        handler: (
            element: HTMLNativeExec<ViewState, ElementType>,
            viewState: ViewState,
            coordinate: Coordinate,
        ) => ResultType,
    ): Array<ResultType>;
}

export interface HTMLElementCollectionProxy<ViewState, ElementType extends HTMLElement>
    extends GlobalJayEvents<ViewState>,
        HTMLElementCollectionProxyTarget<ViewState, ElementType> {}

export interface HTMLNativeExec<ViewState, ElementType extends HTMLElement> {
    exec$<ResultType>(
        handler: JayNativeFunction<ElementType, ViewState, ResultType>,
    ): Promise<ResultType>;
}

export interface HTMLElementProxyTarget<ViewState, ElementType extends HTMLElement>
    extends HTMLNativeExec<ViewState, ElementType> {
    addEventListener<E extends Event>(
        type: string,
        handler: JayEventHandler<E, ViewState, any>,
        options?: boolean | AddEventListenerOptions,
    );
    removeEventListener<E extends Event>(
        type: string,
        handler: JayEventHandler<E, ViewState, any>,
        options?: EventListenerOptions | boolean,
    );
}

export interface HTMLElementProxy<ViewState, ElementType extends HTMLElement>
    extends GlobalJayEvents<ViewState>,
        HTMLElementProxyTarget<ViewState, ElementType> {}

/** Components references **/

export interface EventEmitter<EventType, ViewState> {
    (handler: JayEventHandler<EventType, ViewState, void>): void;
    emit: (event?: EventType) => void;
}

export type EventTypeFrom<Type> = Type extends EventEmitter<infer X, any> ? X : null;

export interface ComponentProxy<
    ViewState,
    ComponentType extends JayComponent<any, ViewState, any>,
> {
    addEventListener(
        type: string,
        handler: JayEventHandler<any, ViewState, void>,
        options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener(
        type: string,
        handler: JayEventHandler<any, ViewState, void>,
        options?: EventListenerOptions | boolean,
    ): void;

    // get comp(): ComponentType | undefined
}

export interface ComponentCollectionProxy<
    ViewState,
    ComponentType extends JayComponent<any, any, any>,
> {
    addEventListener(
        type: string,
        handler: JayEventHandler<any, ViewState, void>,
        options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener(
        type: string,
        handler: JayEventHandler<any, ViewState, void>,
        options?: EventListenerOptions | boolean,
    ): void;

    map<ResultType>(
        handler: (comp: ComponentType, viewState: ViewState, coordinate: Coordinate) => ResultType,
    ): Array<ResultType>;
    find(predicate: (t: ViewState) => boolean): ComponentType | undefined;
}
