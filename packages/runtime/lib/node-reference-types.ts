import {JayComponent, JayEvent, JayEventHandler} from "./element-types";

/** DOM element references **/
export type JeyEventHandler<ViewState> = (viewState: ViewState, coordinate: string) => void
type JayNativeFunction<ElementType extends HTMLElement, ViewState, Result> = (elem: ElementType, viewState: ViewState) => Result
interface JayNativeEventBuilder<ViewState, EventData> {
  then(handler: (event: JayEvent<EventData, ViewState>) => void): void
}

interface GlobalJayEvents<ViewState> {
  onabort(handler: JayEventHandler<void, ViewState, void>): void
  $onabort<EventData>(handler: JayEventHandler<UIEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onanimationcancel(handler: JayEventHandler<void, ViewState, void>): void
  $onanimationcancel<EventData>(handler: JayEventHandler<AnimationEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onanimationend(handler: JayEventHandler<void, ViewState, void>): void
  $onanimationend<EventData>(handler: JayEventHandler<AnimationEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onanimationiteration(handler: JayEventHandler<void, ViewState, void>): void
  $onanimationiteration<EventData>(handler: JayEventHandler<AnimationEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onanimationstart(handler: JayEventHandler<void, ViewState, void>): void
  $onanimationstart<EventData>(handler: JayEventHandler<AnimationEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onauxclick(handler: JayEventHandler<void, ViewState, void>): void
  $onauxclick<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onblur(handler: JayEventHandler<void, ViewState, void>): void
  $onblur<EventData>(handler: JayEventHandler<FocusEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  oncanplay(handler: JayEventHandler<void, ViewState, void>): void
  $oncanplay<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  oncanplaythrough(handler: JayEventHandler<void, ViewState, void>): void
  $oncanplaythrough<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onchange(handler: JayEventHandler<void, ViewState, void>): void
  $onchange<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onclick(handler: JayEventHandler<void, ViewState, void>): void
  $onclick<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onclose(handler: JayEventHandler<void, ViewState, void>): void
  $onclose<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  oncontextmenu(handler: JayEventHandler<void, ViewState, void>): void
  $oncontextmenu<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  oncuechange(handler: JayEventHandler<void, ViewState, void>): void
  $oncuechange<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ondblclick(handler: JayEventHandler<void, ViewState, void>): void
  $ondblclick<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ondrag(handler: JayEventHandler<void, ViewState, void>): void
  $ondrag<EventData>(handler: JayEventHandler<DragEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ondragend(handler: JayEventHandler<void, ViewState, void>): void
  $ondragend<EventData>(handler: JayEventHandler<DragEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ondragenter(handler: JayEventHandler<void, ViewState, void>): void
  $ondragenter<EventData>(handler: JayEventHandler<DragEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ondragleave(handler: JayEventHandler<void, ViewState, void>): void
  $ondragleave<EventData>(handler: JayEventHandler<DragEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ondragover(handler: JayEventHandler<void, ViewState, void>): void
  $ondragover<EventData>(handler: JayEventHandler<DragEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ondragstart(handler: JayEventHandler<void, ViewState, void>): void
  $ondragstart<EventData>(handler: JayEventHandler<DragEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ondrop(handler: JayEventHandler<void, ViewState, void>): void
  $ondrop<EventData>(handler: JayEventHandler<DragEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ondurationchange(handler: JayEventHandler<void, ViewState, void>): void
  $ondurationchange<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onemptied(handler: JayEventHandler<void, ViewState, void>): void
  $onemptied<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onended(handler: JayEventHandler<void, ViewState, void>): void
  $onended<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
//  onerror: OnErrorEventHandler;
  onfocus(handler: JayEventHandler<void, ViewState, void>): void
  $onfocus<EventData>(handler: JayEventHandler<FocusEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onformdata(handler: JayEventHandler<void, ViewState, void>): void
  $onformdata<EventData>(handler: JayEventHandler<FormDataEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ongotpointercapture(handler: JayEventHandler<void, ViewState, void>): void
  $ongotpointercapture<EventData>(handler: JayEventHandler<PointerEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  oninput(handler: JayEventHandler<void, ViewState, void>): void
  $oninput<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  oninvalid(handler: JayEventHandler<void, ViewState, void>): void
  $oninvalid<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onkeydown(handler: JayEventHandler<void, ViewState, void>): void
  $onkeydown<EventData>(handler: JayEventHandler<KeyboardEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onkeypress(handler: JayEventHandler<void, ViewState, void>): void
  $onkeypress<EventData>(handler: JayEventHandler<KeyboardEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onkeyup(handler: JayEventHandler<void, ViewState, void>): void
  $onkeyup<EventData>(handler: JayEventHandler<KeyboardEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onload(handler: JayEventHandler<void, ViewState, void>): void
  $onload<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onloadeddata(handler: JayEventHandler<void, ViewState, void>): void
  $onloadeddata<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onloadedmetadata(handler: JayEventHandler<void, ViewState, void>): void
  $onloadedmetadata<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onloadstart(handler: JayEventHandler<void, ViewState, void>): void
  $onloadstart<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onlostpointercapture(handler: JayEventHandler<void, ViewState, void>): void
  $onlostpointercapture<EventData>(handler: JayEventHandler<PointerEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onmousedown(handler: JayEventHandler<void, ViewState, void>): void
  $onmousedown<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onmouseenter(handler: JayEventHandler<void, ViewState, void>): void
  $onmouseenter<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onmouseleave(handler: JayEventHandler<void, ViewState, void>): void
  $onmouseleave<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onmousemove(handler: JayEventHandler<void, ViewState, void>): void
  $onmousemove<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onmouseout(handler: JayEventHandler<void, ViewState, void>): void
  $onmouseout<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onmouseover(handler: JayEventHandler<void, ViewState, void>): void
  $onmouseover<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onmouseup(handler: JayEventHandler<void, ViewState, void>): void
  $onmouseup<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onpause(handler: JayEventHandler<void, ViewState, void>): void
  $onpause<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onplay(handler: JayEventHandler<void, ViewState, void>): void
  $onplay<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onplaying(handler: JayEventHandler<void, ViewState, void>): void
  $onplaying<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onpointercancel(handler: JayEventHandler<void, ViewState, void>): void
  $onpointercancel<EventData>(handler: JayEventHandler<PointerEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onpointerdown(handler: JayEventHandler<void, ViewState, void>): void
  $onpointerdown<EventData>(handler: JayEventHandler<PointerEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onpointerenter(handler: JayEventHandler<void, ViewState, void>): void
  $onpointerenter<EventData>(handler: JayEventHandler<PointerEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onpointerleave(handler: JayEventHandler<void, ViewState, void>): void
  $onpointerleave<EventData>(handler: JayEventHandler<PointerEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onpointermove(handler: JayEventHandler<void, ViewState, void>): void
  $onpointermove<EventData>(handler: JayEventHandler<PointerEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onpointerout(handler: JayEventHandler<void, ViewState, void>): void
  $onpointerout<EventData>(handler: JayEventHandler<PointerEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onpointerover(handler: JayEventHandler<void, ViewState, void>): void
  $onpointerover<EventData>(handler: JayEventHandler<PointerEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onpointerup(handler: JayEventHandler<void, ViewState, void>): void
  $onpointerup<EventData>(handler: JayEventHandler<PointerEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onprogress(handler: JayEventHandler<void, ViewState, void>): void
  $onprogress<EventData>(handler: JayEventHandler<ProgressEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onratechange(handler: JayEventHandler<void, ViewState, void>): void
  $onratechange<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onreset(handler: JayEventHandler<void, ViewState, void>): void
  $onreset<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onresize(handler: JayEventHandler<void, ViewState, void>): void
  $onresize<EventData>(handler: JayEventHandler<UIEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onscroll(handler: JayEventHandler<void, ViewState, void>): void
  $onscroll<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onseeked(handler: JayEventHandler<void, ViewState, void>): void
  $onseeked<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onseeking(handler: JayEventHandler<void, ViewState, void>): void
  $onseeking<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onselect(handler: JayEventHandler<void, ViewState, void>): void
  $onselect<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onselectionchange(handler: JayEventHandler<void, ViewState, void>): void
  $onselectionchange<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onselectstart(handler: JayEventHandler<void, ViewState, void>): void
  $onselectstart<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onstalled(handler: JayEventHandler<void, ViewState, void>): void
  $onstalled<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onsubmit(handler: JayEventHandler<void, ViewState, void>): void
  $onsubmit<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onsuspend(handler: JayEventHandler<void, ViewState, void>): void
  $onsuspend<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontimeupdate(handler: JayEventHandler<void, ViewState, void>): void
  $ontimeupdate<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontoggle(handler: JayEventHandler<void, ViewState, void>): void
  $ontoggle<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>

  ontouchcancel(handler: JayEventHandler<void, ViewState, void>): void
  $ontouchcancel<EventData>(handler: JayEventHandler<TouchEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontouchend(handler: JayEventHandler<void, ViewState, void>): void
  $ontouchend<EventData>(handler: JayEventHandler<TouchEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontouchmove(handler: JayEventHandler<void, ViewState, void>): void
  $ontouchmove<EventData>(handler: JayEventHandler<TouchEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontouchstart(handler: JayEventHandler<void, ViewState, void>): void
  $ontouchstart<EventData>(handler: JayEventHandler<TouchEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>

  ontransitioncancel(handler: JayEventHandler<void, ViewState, void>): void
  $ontransitioncancel<EventData>(handler: JayEventHandler<TransitionEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontransitionend(handler: JayEventHandler<void, ViewState, void>): void
  $ontransitionend<EventData>(handler: JayEventHandler<TransitionEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontransitionrun(handler: JayEventHandler<void, ViewState, void>): void
  $ontransitionrun<EventData>(handler: JayEventHandler<TransitionEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontransitionstart(handler: JayEventHandler<void, ViewState, void>): void
  $ontransitionstart<EventData>(handler: JayEventHandler<TransitionEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>

  onvolumechange(handler: JayEventHandler<void, ViewState, void>): void
  $onvolumechange<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontransitionstart(handler: JayEventHandler<void, ViewState, void>): void
  $ontransitionstart<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontransitionstart(handler: JayEventHandler<void, ViewState, void>): void
  $ontransitionstart<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontransitionstart(handler: JayEventHandler<void, ViewState, void>): void
  $ontransitionstart<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  ontransitionstart(handler: JayEventHandler<void, ViewState, void>): void
  $ontransitionstart<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>

  onvolumechange(handler: JayEventHandler<void, ViewState, void>): void
  $onvolumechange<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onwaiting(handler: JayEventHandler<void, ViewState, void>): void
  $onwaiting<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onwebkitanimationend(handler: JayEventHandler<void, ViewState, void>): void
  $onwebkitanimationend<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onwebkitanimationiteration(handler: JayEventHandler<void, ViewState, void>): void
  $onwebkitanimationiteration<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onwebkitanimationstart(handler: JayEventHandler<void, ViewState, void>): void
  $onwebkitanimationstart<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onwebkittransitionend(handler: JayEventHandler<void, ViewState, void>): void
  $onwebkittransitionend<EventData>(handler: JayEventHandler<Event, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
  onwheel(handler: JayEventHandler<void, ViewState, void>): void
  $onwheel<EventData>(handler: JayEventHandler<WheelEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>
}

export interface HTMLElementCollectionProxy<ViewState, ElementType extends HTMLElement> extends GlobalJayEvents<ViewState> {
  addEventListener(type: string, handler: JeyEventHandler<ViewState>)
  removeEventListener(type: string, handler: JeyEventHandler<ViewState>)

  find(predicate: (t: ViewState) => boolean): HTMLElementProxy<ViewState, ElementType>
  map<ResultType>(handler: (element: HTMLElementProxy<ViewState, ElementType>, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType>
}

export interface HTMLElementProxy<ViewState, ElementType extends HTMLElement> extends GlobalJayEvents<ViewState>{
  addEventListener(type: string, handler: JeyEventHandler<ViewState>)
  removeEventListener(type: string, handler: JeyEventHandler<ViewState>)

  $exec<ResultType>(handler: JayNativeFunction<ElementType, ViewState, ResultType>): ResultType
}

/** Components references **/

export interface EventEmitter<EventType, ViewState> {
  (handler: JayEventHandler<EventType, ViewState, void>): void
  emit(event: EventType): void
}

export type EventTypeFrom<Type> = Type extends EventEmitter<infer X, any> ? X : null

export interface ComponentCollectionProxyOperations<ViewState, ComponentType extends JayComponent<any, any, any>> {
  addEventListener(type: string, handler: JayEventHandler<any, ViewState, void>): void
  removeEventListener(type: string, handler: JayEventHandler<any, ViewState, void>): void

  map<ResultType>(handler: (comp: ComponentType, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType>
  find(predicate: (t: ViewState) => boolean): ComponentType
}

export type ComponentCollectionProxy<ViewState, ComponentType extends JayComponent<any, any, any>> =
  ComponentCollectionProxyOperations<ViewState, ComponentType>