const Jay = <T>(t:T)=>t;
Jay.renderTemplate = (type: string, props: Record<string, unknown>)=>{
    //
}

Jay.prerendered = {} as Record<string, JayNode>
Jay.renderToString = (content: JayNode)=>{
    return ''
}
Jay.serverMemo =( _id: string,node: JayNode)=>{
    return node;
}

Jay.map =<T, U>(arr: Signal<T[]>, cb: (val: Signal<T>)=>U):Signal<U[]>=>{
    return arr as any as Signal<U[]>;
}

Jay.fetch =<T>( url: string): Promise<Signal<T>>=>{
    return url as any as Promise<Signal<T>>;
}

Jay.saveForClient =<T extends  Signal<any> | string | number | JayNode>( _id: string,node:T):T=>{
    return node;
}
Jay.getClientData =<T extends  Signal<any> | string | number | JayNode>( _id: string):T=>{
    return {} as any;
}
Jay.registerPrerendered = <T>(id: string, res: string)=>{};
Jay.registerComp = <T>(id: string, Comp: unknown)=>Comp
Jay.registerTemplate = <T>(id: string, Comp: T)=>Comp
Jay.useState = <T>(initial: T | Signal<T>)=>{
    return new ClientSignal<T>()
}

Jay.Signal = <T>(defaultValue: T)=>new ClientSignal<T>()
Jay.BuildSignal = <T>(defaultValue: T)=>new Signal<T>()
Jay.ServerSignal = <T>(defaultValue: T)=>new Signal<T>()
export interface CompiledJay<P, TP>{
    logic: (p:P)=>TP,
    template: (p: TP & P)=>JayNode
}

export class Signal<T>{
    value: T;
    id: string;
}


export class ClientSignal<T> extends Signal<T>{
    value: T;
    set:(t:T)=>void
}

type JSXElementConstructor<P> = ((
    props: P,
    /**
     * @deprecated https://legacy.reactjs.org/docs/legacy-context.html#referencing-context-in-stateless-function-components
     */
) => JayNode | Promise<JayNode>)
export type JayNode =
| JayElement
| string
| number
| boolean
| null
| undefined
| JayNode[]
| Signal<JayNode>

interface JayElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
    type: T;
    props: P;
    key: Key | null;
}
type Key = string | number;

interface Ref<V>{
    current: V | null
}


declare global {
    /**
     * @deprecated Use `Jay.JSX` instead of the global `JSX` namespace.
     */
    namespace JSX {
        // We don't just alias Jay.ElementType because Jay.ElementType
        // historically does more than we need it to.
        // E.g. it also contains .propTypes and so TS also verifies the declared
        // props type does match the declared .propTypes.
        // But if libraries declared their .propTypes but not props type,
        // or they mismatch, you won't be able to use the class component
        // as a JSX.ElementType.
        // We could fix this everywhere but we're ultimately not interested in
        // .propTypes assignability so we might as well drop it entirely here to
        //  reduce the work of the type-checker.
        // TODO: Check impact of making Jay.ElementType<P = any> = Jay.JSXElementConstructor<P>
        type ElementType = string | JSXElementConstructor<any>;
        type Element = JayElement<any, any>
     
        interface ElementAttributesProperty { props: {}; }
        interface ElementChildrenAttribute { children: {}; }

        type LibraryManagedAttributes<C, P> = P | { workerRendered: true; saveForClient?: boolean}

        type HTMLProps<P, E> = P & WithKey & WithRef<E> & {
            onChange?: (ev: Event & {target:E})=>void
        }
        type NonVoidElementHTMLProps<P, E> = HTMLProps<P& {children?:JayNode}, E>
        type SVGProps<E> = WithKey & WithRef<E>
        interface WithRef<E>{
            ref?: Ref<E>
        }


        interface WithKey {
            key?: Key | null | undefined;
            // is hidden allows rendering components and hiding 
            isHidden?: boolean
        }
        type IntrinsicAttributes<COMP > = WithKey


        
          interface IntrinsicElements {
            // HTML
            a: NonVoidElementHTMLProps<{
                href: string
            }, HTMLAnchorElement>;
            abbr: NonVoidElementHTMLProps<{}, HTMLElement>;
            address: NonVoidElementHTMLProps<{}, HTMLElement>;
            area: NonVoidElementHTMLProps<{}, HTMLAreaElement>;
            article: NonVoidElementHTMLProps<{}, HTMLElement>;
            aside: NonVoidElementHTMLProps<{}, HTMLElement>;
            audio: NonVoidElementHTMLProps<{}, HTMLAudioElement>;
            b: NonVoidElementHTMLProps<{}, HTMLElement>;
            base: NonVoidElementHTMLProps<{}, HTMLBaseElement>;
            bdi: NonVoidElementHTMLProps<{}, HTMLElement>;
            bdo: NonVoidElementHTMLProps<{}, HTMLElement>;
            big: NonVoidElementHTMLProps<{}, HTMLElement>;
            blockquote: NonVoidElementHTMLProps<{}, HTMLQuoteElement>;
            body: NonVoidElementHTMLProps<{}, HTMLBodyElement>;
            br: NonVoidElementHTMLProps<{}, HTMLBRElement>;
            button: NonVoidElementHTMLProps<{}, HTMLButtonElement>;
            canvas: NonVoidElementHTMLProps<{}, HTMLCanvasElement>;
            caption: NonVoidElementHTMLProps<{}, HTMLElement>;
            center: NonVoidElementHTMLProps<{}, HTMLElement>;
            cite: NonVoidElementHTMLProps<{}, HTMLElement>;
            code: NonVoidElementHTMLProps<{}, HTMLElement>;
            col: NonVoidElementHTMLProps<{}, HTMLTableColElement>;
            colgroup: NonVoidElementHTMLProps<{}, HTMLTableColElement>;
            data: NonVoidElementHTMLProps<{}, HTMLDataElement>;
            datalist: NonVoidElementHTMLProps<{}, HTMLDataListElement>;
            dd: NonVoidElementHTMLProps<{}, HTMLElement>;
            del: NonVoidElementHTMLProps<{}, HTMLModElement>;
            details: NonVoidElementHTMLProps<{}, HTMLDetailsElement>;
            dfn: NonVoidElementHTMLProps<{}, HTMLElement>;
            dialog: NonVoidElementHTMLProps<{}, HTMLDialogElement>;
            div: NonVoidElementHTMLProps<{}, HTMLDivElement>;
            dl: NonVoidElementHTMLProps<{}, HTMLDListElement>;
            dt: NonVoidElementHTMLProps<{}, HTMLElement>;
            em: NonVoidElementHTMLProps<{}, HTMLElement>;
            embed: NonVoidElementHTMLProps<{}, HTMLEmbedElement>;
            fieldset: NonVoidElementHTMLProps<{}, HTMLFieldSetElement>;
            figcaption: NonVoidElementHTMLProps<{}, HTMLElement>;
            figure: NonVoidElementHTMLProps<{}, HTMLElement>;
            footer: NonVoidElementHTMLProps<{}, HTMLElement>;
            form: NonVoidElementHTMLProps<{}, HTMLFormElement>;
            h1: NonVoidElementHTMLProps<{}, HTMLHeadingElement>;
            h2: NonVoidElementHTMLProps<{}, HTMLHeadingElement>;
            h3: NonVoidElementHTMLProps<{}, HTMLHeadingElement>;
            h4: NonVoidElementHTMLProps<{}, HTMLHeadingElement>;
            h5: NonVoidElementHTMLProps<{}, HTMLHeadingElement>;
            h6: NonVoidElementHTMLProps<{}, HTMLHeadingElement>;
            head: NonVoidElementHTMLProps<{}, HTMLHeadElement>;
            header: NonVoidElementHTMLProps<{}, HTMLElement>;
            hgroup: NonVoidElementHTMLProps<{}, HTMLElement>;
            hr: NonVoidElementHTMLProps<{}, HTMLHRElement>;
            html: NonVoidElementHTMLProps<{}, HTMLHtmlElement>;
            i: NonVoidElementHTMLProps<{}, HTMLElement>;
            iframe: NonVoidElementHTMLProps<{}, HTMLIFrameElement>;
            img: NonVoidElementHTMLProps<{src: string}, HTMLImageElement>;
            input: NonVoidElementHTMLProps<{
                value?: string | number
            }, HTMLInputElement>;
            ins: NonVoidElementHTMLProps<{}, HTMLModElement>;
            kbd: NonVoidElementHTMLProps<{}, HTMLElement>;
            keygen: NonVoidElementHTMLProps<{}, HTMLElement>;
            label: NonVoidElementHTMLProps<{}, HTMLLabelElement>;
            legend: NonVoidElementHTMLProps<{}, HTMLLegendElement>;
            li: NonVoidElementHTMLProps<{}, HTMLLIElement>;
            link: NonVoidElementHTMLProps<{}, HTMLLinkElement>;
            main: NonVoidElementHTMLProps<{}, HTMLElement>;
            map: NonVoidElementHTMLProps<{}, HTMLMapElement>;
            mark: NonVoidElementHTMLProps<{}, HTMLElement>;
            menu: NonVoidElementHTMLProps<{}, HTMLElement>;
            menuitem: NonVoidElementHTMLProps<{}, HTMLElement>;
            meta: NonVoidElementHTMLProps<{}, HTMLMetaElement>;
            meter: NonVoidElementHTMLProps<{}, HTMLMeterElement>;
            nav: NonVoidElementHTMLProps<{}, HTMLElement>;
            noindex: NonVoidElementHTMLProps<{}, HTMLElement>;
            noscript: NonVoidElementHTMLProps<{}, HTMLElement>;
            object: NonVoidElementHTMLProps<{}, HTMLObjectElement>;
            ol: NonVoidElementHTMLProps<{}, HTMLOListElement>;
            optgroup: NonVoidElementHTMLProps<{}, HTMLOptGroupElement>;
            option: NonVoidElementHTMLProps<{}, HTMLOptionElement>;
            output: NonVoidElementHTMLProps<{}, HTMLOutputElement>;
            p: NonVoidElementHTMLProps<{}, HTMLParagraphElement>;
            param: NonVoidElementHTMLProps<{}, HTMLParamElement>;
            picture: NonVoidElementHTMLProps<{}, HTMLElement>;
            pre: NonVoidElementHTMLProps<{}, HTMLPreElement>;
            progress: NonVoidElementHTMLProps<{}, HTMLProgressElement>;
            q: NonVoidElementHTMLProps<{}, HTMLQuoteElement>;
            rp: NonVoidElementHTMLProps<{}, HTMLElement>;
            rt: NonVoidElementHTMLProps<{}, HTMLElement>;
            ruby: NonVoidElementHTMLProps<{}, HTMLElement>;
            s: NonVoidElementHTMLProps<{}, HTMLElement>;
            samp: NonVoidElementHTMLProps<{}, HTMLElement>;
            slot: NonVoidElementHTMLProps<{}, HTMLSlotElement>;
            script: NonVoidElementHTMLProps<{}, HTMLScriptElement>;
            section: NonVoidElementHTMLProps<{}, HTMLElement>;
            select: NonVoidElementHTMLProps<{}, HTMLSelectElement>;
            small: NonVoidElementHTMLProps<{}, HTMLElement>;
            source: NonVoidElementHTMLProps<{}, HTMLSourceElement>;
            span: NonVoidElementHTMLProps<{}, HTMLSpanElement>;
            strong: NonVoidElementHTMLProps<{}, HTMLElement>;
            style: NonVoidElementHTMLProps<{}, HTMLStyleElement>;
            sub: NonVoidElementHTMLProps<{}, HTMLElement>;
            summary: NonVoidElementHTMLProps<{}, HTMLElement>;
            sup: NonVoidElementHTMLProps<{}, HTMLElement>;
            table: NonVoidElementHTMLProps<{}, HTMLTableElement>;
            template: NonVoidElementHTMLProps<{}, HTMLTemplateElement>;
            tbody: NonVoidElementHTMLProps<{}, HTMLTableSectionElement>;
            td: NonVoidElementHTMLProps<{}, HTMLTableDataCellElement>;
            textarea: NonVoidElementHTMLProps<{}, HTMLTextAreaElement>;
            tfoot: NonVoidElementHTMLProps<{}, HTMLTableSectionElement>;
            th: NonVoidElementHTMLProps<{}, HTMLTableHeaderCellElement>;
            thead: NonVoidElementHTMLProps<{}, HTMLTableSectionElement>;
            time: NonVoidElementHTMLProps<{}, HTMLTimeElement>;
            title: NonVoidElementHTMLProps<{}, HTMLTitleElement>;
            tr: NonVoidElementHTMLProps<{}, HTMLTableRowElement>;
            track: NonVoidElementHTMLProps<{}, HTMLTrackElement>;
            u: NonVoidElementHTMLProps<{}, HTMLElement>;
            ul: NonVoidElementHTMLProps<{}, HTMLUListElement>;
            "var": NonVoidElementHTMLProps<{}, HTMLElement>;
            video: NonVoidElementHTMLProps<{}, HTMLVideoElement>;
            wbr: NonVoidElementHTMLProps<{}, HTMLElement>;
            webview: NonVoidElementHTMLProps<{}, HTMLElement>;

            // SVG
            svg: SVGProps<SVGSVGElement>;

            animate: SVGProps<SVGElement>; // TODO: It is SVGAnimateElement but is not in TypeScript's lib.dom.d.ts for now.
            animateMotion: SVGProps<SVGElement>;
            animateTransform: SVGProps<SVGElement>; // TODO: It is SVGAnimateTransformElement but is not in TypeScript's lib.dom.d.ts for now.
            circle: SVGProps<SVGCircleElement>;
            clipPath: SVGProps<SVGClipPathElement>;
            defs: SVGProps<SVGDefsElement>;
            desc: SVGProps<SVGDescElement>;
            ellipse: SVGProps<SVGEllipseElement>;
            feBlend: SVGProps<SVGFEBlendElement>;
            feColorMatrix: SVGProps<SVGFEColorMatrixElement>;
            feComponentTransfer: SVGProps<SVGFEComponentTransferElement>;
            feComposite: SVGProps<SVGFECompositeElement>;
            feConvolveMatrix: SVGProps<SVGFEConvolveMatrixElement>;
            feDiffuseLighting: SVGProps<SVGFEDiffuseLightingElement>;
            feDisplacementMap: SVGProps<SVGFEDisplacementMapElement>;
            feDistantLight: SVGProps<SVGFEDistantLightElement>;
            feDropShadow: SVGProps<SVGFEDropShadowElement>;
            feFlood: SVGProps<SVGFEFloodElement>;
            feFuncA: SVGProps<SVGFEFuncAElement>;
            feFuncB: SVGProps<SVGFEFuncBElement>;
            feFuncG: SVGProps<SVGFEFuncGElement>;
            feFuncR: SVGProps<SVGFEFuncRElement>;
            feGaussianBlur: SVGProps<SVGFEGaussianBlurElement>;
            feImage: SVGProps<SVGFEImageElement>;
            feMerge: SVGProps<SVGFEMergeElement>;
            feMergeNode: SVGProps<SVGFEMergeNodeElement>;
            feMorphology: SVGProps<SVGFEMorphologyElement>;
            feOffset: SVGProps<SVGFEOffsetElement>;
            fePointLight: SVGProps<SVGFEPointLightElement>;
            feSpecularLighting: SVGProps<SVGFESpecularLightingElement>;
            feSpotLight: SVGProps<SVGFESpotLightElement>;
            feTile: SVGProps<SVGFETileElement>;
            feTurbulence: SVGProps<SVGFETurbulenceElement>;
            filter: SVGProps<SVGFilterElement>;
            foreignObject: SVGProps<SVGForeignObjectElement>;
            g: SVGProps<SVGGElement>;
            image: SVGProps<SVGImageElement>;
            line: SVGProps<SVGLineElement>;
            linearGradient: SVGProps<SVGLinearGradientElement>;
            marker: SVGProps<SVGMarkerElement>;
            mask: SVGProps<SVGMaskElement>;
            metadata: SVGProps<SVGMetadataElement>;
            mpath: SVGProps<SVGElement>;
            path: SVGProps<SVGPathElement>;
            pattern: SVGProps<SVGPatternElement>;
            polygon: SVGProps<SVGPolygonElement>;
            polyline: SVGProps<SVGPolylineElement>;
            radialGradient: SVGProps<SVGRadialGradientElement>;
            rect: SVGProps<SVGRectElement>;
            stop: SVGProps<SVGStopElement>;
            switch: SVGProps<SVGSwitchElement>;
            symbol: SVGProps<SVGSymbolElement>;
            text: SVGProps<SVGTextElement>;
            textPath: SVGProps<SVGTextPathElement>;
            tspan: SVGProps<SVGTSpanElement>;
            use: SVGProps<SVGUseElement>;
            view: SVGProps<SVGViewElement>;
        }
    }
}


export default Jay;

