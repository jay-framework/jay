import { Getter, MeasureOfChange, Reactive, Setter, ValueOrGetter } from 'jay-reactive';
import { JSONPatch, patch } from 'jay-json-patch';
import { ContextMarker, EventEmitter, findContext } from 'jay-runtime';
import { Patcher } from './component';
import { COMPONENT_CONTEXT, CONTEXT_CREATION_CONTEXT, HookContext } from './component-contexts';
import {createReactiveContext} from "./context-api";

function currentHookContext(): HookContext {
    return findContext((_) => _ === COMPONENT_CONTEXT || _ === CONTEXT_CREATION_CONTEXT);
}

type EffectCleanup = () => void;
export function createEffect(effect: () => void | EffectCleanup) {
    let cleanup = undefined;

    const clean = () => {
        if (cleanup !== undefined) {
            cleanup();
            cleanup = undefined;
        }
    };

    currentHookContext().reactive.createReaction(() => {
        clean();
        cleanup = effect();
    });
    currentHookContext().unmounts.push(() => {
        clean();
    });
    currentHookContext().mounts.push(() => {
        cleanup = effect();
    });
}

export function createState<T>(value: ValueOrGetter<T>): [get: Getter<T>, set: Setter<T>] {
    return currentHookContext().reactive.createState(value);
}

export function createPatchableState<T>(
    value: ValueOrGetter<T>,
): [get: Getter<T>, set: Setter<T>, patchFunc: Patcher<T>] {
    const [get, set] = createState(value);
    const patchFunc = (...jsonPatch: JSONPatch) => set(patch(get(), jsonPatch));
    return [get, set, patchFunc];
}

export function useReactive(): Reactive {
    return currentHookContext().reactive;
}

export function createMemo<T>(computation: (prev: T) => T, initialValue?: T): Getter<T> {
    let [value, setValue] = currentHookContext().reactive.createState(initialValue);
    currentHookContext().reactive.createReaction(() => {
        setValue((oldValue) => computation(oldValue));
    });
    return value;
}

interface MappedItemTracking<T extends object, U> {
    reactive: Reactive;
    setItem: Setter<T>;
    setIndex: Setter<number>;
    setLength: Setter<number>;
    getMappedItem: Getter<U>;
}
function makeItemTracking<T extends object, U>(
    item: T,
    index: number,
    length: number,
    mapCallback: (item: Getter<T>, index: Getter<number>, length: Getter<number>) => U,
): MappedItemTracking<T, U> {
    let reactive = new Reactive();
    let [getItem, setItem] = reactive.createState(item);
    let [getIndex, setIndex] = reactive.createState(index);
    let [getLength, setLength] = reactive.createState(length);
    let [getMappedItem, setMappedItem] = reactive.createState<U>(undefined);
    reactive.createReaction(() => setMappedItem(mapCallback(getItem, getIndex, getLength)));
    return {
        setItem,
        setIndex,
        setLength,
        getMappedItem,
        reactive,
    };
}

export function createDerivedArray<T extends object, U>(
    arrayGetter: Getter<T[]>,
    mapCallback: (item: Getter<T>, index: Getter<number>, length: Getter<number>) => U,
): Getter<U[]> {
    let [sourceArray] = currentHookContext().reactive.createState<T[]>(
        arrayGetter,
        MeasureOfChange.PARTIAL,
    );
    let [mappedArray, setMappedArray] = createState<U[]>([]);
    let mappedItemsCache = new WeakMap<T, MappedItemTracking<T, U>>();

    currentHookContext().reactive.createReaction((measureOfChange: MeasureOfChange) => {
        let newMappedItemsCache = new WeakMap<T, MappedItemTracking<T, U>>();
        setMappedArray((oldValue) => {
            let length = sourceArray().length;
            let newMappedArray = sourceArray().map((item, index) => {
                let itemTracking: MappedItemTracking<T, U>;
                if (!mappedItemsCache.has(item) || measureOfChange == MeasureOfChange.FULL)
                    newMappedItemsCache.set(
                        item,
                        (itemTracking = makeItemTracking<T, U>(item, index, length, mapCallback)),
                    );
                else {
                    newMappedItemsCache.set(item, (itemTracking = mappedItemsCache.get(item)));
                    itemTracking.reactive.batchReactions(() => {
                        itemTracking.setItem(item);
                        itemTracking.setLength(length);
                        itemTracking.setIndex(index);
                    });
                }
                return itemTracking.getMappedItem();
            });
            mappedItemsCache = newMappedItemsCache;
            return newMappedArray;
        });
    });
    return mappedArray;
}

export function createEvent<EventType>(
    eventEffect?: (emitter: EventEmitter<EventType, any>) => void,
): EventEmitter<EventType, any> {
    let handler;
    let emitter: any = (h) => (handler = h);
    emitter.emit = (event: EventType) => handler && handler({ event });
    if (eventEffect) createEffect(() => eventEffect(emitter));
    return emitter;
}

export function provideContext<ContextType>(
    marker: ContextMarker<ContextType>,
    context: ContextType,
) {
    currentHookContext().provideContexts.push([marker, context]);
}

export function provideReactiveContext<ContextType extends object>(
    marker: ContextMarker<ContextType>,
    mkContext: () => ContextType
): ContextType {
    const context = createReactiveContext(mkContext)
    currentHookContext().provideContexts.push([marker, context]);
    return context;
}