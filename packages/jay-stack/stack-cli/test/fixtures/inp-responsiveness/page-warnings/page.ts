function Page(props, refs) {
    refs.save.onclick(async () => {
        document.querySelector('.x');
        if (!confirm('Save?')) return;
        setTimeout(() => recompute(), 0);
    });
    return { render: () => ({}) };
}
export const page = makeJayStackComponent().withInteractive(Page);
declare function recompute(): void;
declare function makeJayStackComponent(): any;
