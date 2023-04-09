export function dispatchEvent(element: HTMLElement, eventType: string) {
    const event = new Event(eventType, {
        bubbles: true,
        cancelable: true
    });
    element.dispatchEvent(event);

}