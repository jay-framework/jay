import { Getter, MeasureOfChange, mkReactive, Reactive, Setter, ValueOrGetter } from 'jay-reactive';
import { JSONPatch, patch } from 'jay-json-patch';
import { ContextMarker, EventEmitter, findContext } from 'jay-runtime';
import { Patcher } from './component';
import { COMPONENT_CONTEXT, CONTEXT_CREATION_CONTEXT, HookContext } from './component-contexts';
import { createReactiveContext } from './context-api';

function currentHookContext(): HookContext {
    return findContext((_) => _ === COMPONENT_CONTEXT || _ === CONTEXT_CREATION_CONTEXT);
}

export type EffectCleanup = () => void;
export function createEffect(effect: () => void | EffectCleanup) {
    let cleanup = undefined;

    const clean = () => {
        if (cleanup !== undefined) {
            cleanup();
            cleanup = undefined;
        }
    };

    let lastMounted = false;
    const mounted = currentHookContext().mountedSignal[0];
    currentHookContext().reactive.createReaction(() => {
        if (lastMounted !== mounted()) {
            if (mounted()) cleanup = effect();
            else clean();
            lastMounted = mounted();
        } else if (mounted()) {
            clean();
            cleanup = effect();
        }
    });
    // currentHookContext().unmounts.push(() => {
    //     clean();
    // });
    // currentHookContext().mounts.push(() => {
    //     cleanup = effect();
    // });
}

export function createSignal<T>(value: ValueOrGetter<T>): [get: Getter<T>, set: Setter<T>] {
    return currentHookContext().reactive.createSignal(value);
}

export function createPatchableSignal<T>(
    value: ValueOrGetter<T>,
): [get: Getter<T>, set: Setter<T>, patchFunc: Patcher<T>] {
    const [get, set] = createSignal(value);
    const patchFunc = (...jsonPatch: JSONPatch) => set(patch(get(), jsonPatch));
    return [get, set, patchFunc];
}

export function useReactive(): Reactive {
    return currentHookContext().reactive;
}

export function createMemo<T>(computation: (prev: T) => T, initialValue?: T): Getter<T> {
    let [value, setValue] = currentHookContext().reactive.createSignal(initialValue);
    currentHookContext().reactive.createReaction(() => {
        setValue((oldValue) => computation(oldValue));
    });
    return value;
}

interface MappedItemTracking<T extends object, U> {
    mappedItem: U;
    item: T;
    index: number;
    length: number;
    usedIndex: boolean;
    usedLength: boolean;
}

type TrackableGetter<T> = {
    getter: Getter<T>;
    wasUsed(): boolean;
};
function trackableGetter<T>(value: T): TrackableGetter<T> {
    let wasUsed = false;
    return {
        getter: () => {
            wasUsed = true;
            return value;
        },
        wasUsed: () => wasUsed,
    };
}

function mapItem<T extends object, U>(
    item: T,
    index: number,
    length: number,
    force: boolean,
    cached: MappedItemTracking<T, U>,
    mapCallback: (item: Getter<T>, index: Getter<number>, length: Getter<number>) => U,
): MappedItemTracking<T, U> {
    const itemGetter = trackableGetter(item);
    const indexGetter = trackableGetter(index);
    const lengthGetter = trackableGetter(length);

    const needToMap =
        force ||
        !cached ||
        item !== cached.item ||
        (index !== cached.index && cached.usedIndex) ||
        (length !== cached.length && cached.usedLength);

    if (needToMap) {
        const mappedItem = mapCallback(itemGetter.getter, indexGetter.getter, lengthGetter.getter);
        return {
            item,
            mappedItem,
            index,
            length,
            usedIndex: indexGetter.wasUsed(),
            usedLength: lengthGetter.wasUsed(),
        };
    } else return cached;
}

export function createDerivedArray<T extends object, U>(
    arrayGetter: Getter<T[]>,
    mapCallback: (item: Getter<T>, index: Getter<number>, length: Getter<number>) => U,
): Getter<U[]> {
    let [sourceArray] = currentHookContext().reactive.createSignal<T[]>(
        arrayGetter,
        MeasureOfChange.PARTIAL,
    );
    let [mappedArray, setMappedArray] = createSignal<U[]>([]);
    let mappedItemsCache = new WeakMap<T, MappedItemTracking<T, U>>();

    currentHookContext().reactive.createReaction((measureOfChange: MeasureOfChange) => {
        let newMappedItemsCache = new WeakMap<T, MappedItemTracking<T, U>>();
        setMappedArray((oldValue) => {
            let length = sourceArray().length;
            let newMappedArray = sourceArray().map((item, index) => {
                const force = measureOfChange == MeasureOfChange.FULL;
                const mappedItemTracking = mapItem(
                    item,
                    index,
                    length,
                    force,
                    mappedItemsCache.get(item),
                    mapCallback,
                );
                newMappedItemsCache.set(item, mappedItemTracking);
                return mappedItemTracking.mappedItem;
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
    mkContext: () => ContextType,
): ContextType {
    const context = createReactiveContext(mkContext);
    currentHookContext().provideContexts.push([marker, context]);
    return context;
}
