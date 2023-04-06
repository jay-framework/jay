import {renderMessage} from "../comm-channel";
import {useContext} from "jay-runtime";
import {SANDBOX_MARKER} from "./sandbox-context";
import {mkBridgeElement, SandboxElement} from "./sandbox-refs";
import {COMPONENT_CONTEXT} from "jay-component";

// abstract class Ref {
//
//     abstract getRefs(): StaticRef<any>[]
//     abstract update(newViewState: any);
// }
//
// export class StaticRef<ViewState> extends Ref {
//     viewState: ViewState;
//     ep: JayEndpoint;
//     listeners = new Map<string, JayEventHandler<any, any, any>>()
//
//     constructor(
//         public ref: string) {
//         super();
//     }
//
//     getRefs(): StaticRef<any>[] {
//         return [this]
//     }
//
//     addEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: boolean | AddEventListenerOptions): void {
//         if (listener) {
//             this.ep.post(addEventListenerMessage(this.ref, type));
//             this.listeners.set(type, listener)
//         }
//     }
//     removeEventListener<E extends Event>(type: string, listener: JayEventHandler<E, any, any> | null, options?: EventListenerOptions | boolean): void {
//         // todo add remove
//     }
//
//     invoke(type: string, eventData: any, coordinate: Coordinate) {
//         let listener = this.listeners.get(type)
//         // let eventViewState = this.getVS(compViewState, coordinate)
//         if (listener)
//             listener({
//                 event: type,
//                 viewState: this.viewState,
//                 coordinate: [this.ref]
//             })
//     }
//     $exec<ResultType>(handler: JayNativeFunction<any, any, ResultType>): Promise<ResultType> {
//         return null;
//     }
//     update(newViewState: ViewState) {
//         this.viewState = newViewState
//     }
// }
//
// export class DynamicRef<ParentViewState, ItemViewState> extends Ref {
//     private itemsMap: Record<string, ItemViewState> = {};
//     constructor(
//         private getItems: (pvs: ParentViewState) => ItemViewState[],
//         private matchBy: string,
//         private refDefinitions: Ref[]) {
//         super();
//     }
//
//     getRefs(): StaticRef<any>[] {
//         return this.refDefinitions.flatMap(_ => _.getRefs())
//     }
//
//     update(newViewState: ParentViewState) {
//         this.refDefinitions.forEach(_ => _.update(newViewState))
//         let items = this.getItems(newViewState);
//         this.itemsMap = items.reduce((obj, item) => {
//             return {
//                 ...obj,
//                 [item[this.matchBy]]: item
//             }
//         }, {})
//
//     }
//
// }
//
// export function mkRef<ViewState>(ref: string, getVS: (viewState: ViewState, coordinate: string[]) => any = (U: ViewState, C) => U): StaticRef<ViewState> {
//     return new StaticRef(ref);
// }
//
// const proxyHandler = {
//     get: function(target, prop, receiver) {
//         if (typeof prop === 'string') {
//             if (prop.indexOf("on") === 0) {
//                 let eventName = prop.substring(2);
//                 return (handler) => {
//                     target.addEventListener(eventName, handler);
//                 }
//             }
//             if (prop.indexOf("$on") === 0) {
//                 let eventName = prop.substring(3);
//                 return (nativeHandler) => {
//                     let regularHandler;
//                     const handler = ({event, viewState, coordinate}) => {
//                         const returnedEvent = nativeHandler({event, viewState, coordinate});
//                         if (regularHandler)
//                             regularHandler({event: returnedEvent, viewState, coordinate});
//                     }
//                     target.addEventListener(eventName, handler);
//                     return {
//                         then: (handler) => {
//                             regularHandler = handler;
//                         }
//                     }
//                 }
//             }
//         }
//         return target[prop];
//     }
// }
//
//
// function proxyRef<ViewState>(refDef: StaticRef<ViewState>): HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any> {
//     return new Proxy(refDef, proxyHandler);
// }
//
export function elementBridge<ElementViewState>(viewState: ElementViewState, sandboxElements: () => SandboxElement<ElementViewState>[],
                                                dynamicRefs: string[] = []) {
    let parentContext = useContext(SANDBOX_MARKER);
    let {reactive} = useContext(COMPONENT_CONTEXT);
    let ep = parentContext.port.getEndpoint(parentContext.compId, parentContext.coordinate)
    // let refs = {};
    // let elementViewState = viewState;
    ep.post(renderMessage(viewState));
    return mkBridgeElement(viewState, ep, reactive, sandboxElements, dynamicRefs);
    // return {
    //     dom: null,
    //     update: (newData: any) => {
    //         elementViewState = newData;
    //         ep.post(renderMessage(newData));
    //     },
    //     mount: () => {},
    //     unmount: () => {},
    //     impl
    // }
}