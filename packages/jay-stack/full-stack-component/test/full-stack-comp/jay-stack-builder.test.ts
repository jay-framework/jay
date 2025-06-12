import { comp } from './full-stack-component';

describe('jay-stack-builder', () => {
    it('type system works and builder returns the declared information', async () => {
        const component = comp;
        expect(component.comp).toBeDefined();
        expect(component.fastRender).toBeDefined();
        expect(component.slowlyRender).toBeDefined();
        expect(component.serverContexts).toHaveLength(1);
    });
});
