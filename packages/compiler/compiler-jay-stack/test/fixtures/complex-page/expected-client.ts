import {
    makeJayStackComponent,
    PageProps,
    UrlParams
} from '@jay-framework/fullstack-component';
import {createSignal, Props} from '@jay-framework/component';
import {
    ProductPageContract,
    ProductPageFastViewState,
    ProductPageRefs,
//@ts-ignore
} from '../contracts/product-page.jay-contract';
//@ts-ignore
import {WixStoresContext, WIX_STORES_SERVICE_MARKER} from '../stores-client/wix-stores-context';
//@ts-ignore
import {MediaGalleryViewState, Selected} from "../contracts/media-gallery.jay-contract";

/**
 * URL parameters for product page routes
 * Supports dynamic routing like /products/[slug]
 */
export interface ProductPageParams extends UrlParams {
    slug: string;
}

/**
 * Data carried forward from fast rendering to interactive phase
 */
interface ProductFastCarryForward {
    defaultVS: ProductPageFastViewState
}

/**
 * Interactive Phase (Client-Side)
 * Handles user interactions:
 * - Variant/option selection
 * - Quantity adjustments
 * - Add to cart action
 */
function ProductPageInteractive(
    props: Props<PageProps & ProductPageParams & ProductFastCarryForward>,
    refs: ProductPageRefs
) {

    const [quantity, setQuantity] = createSignal(props.defaultVS().quantity.quantity);
    const [actionsEnabled, setActionsEnabled] = createSignal(props.defaultVS().actionsEnabled);
    const [options, setOptions] = createSignal(props.defaultVS().options);
    const [modifiers, setModifiers] = createSignal(props.defaultVS().modifiers);
    const [mediaGallery, setMediaGallery] = createSignal(props.defaultVS().mediaGallery);
    const [sku, setSKU] = createSignal(props.defaultVS().sku);
    const [price, setPrice] = createSignal(props.defaultVS().price);
    const [pricePerUnit, setPricePerUnit] = createSignal(props.defaultVS().pricePerUnit);
    const [stockStatus, setStockStatus] = createSignal(props.defaultVS().stockStatus);
    const [strikethroughPrice, setStrikethroughPrice] = createSignal(props.defaultVS().strikethroughPrice);

    const [isAddingToCart, setIsAddingToCart] = createSignal(false);
    const [selectedChoices, setSelectedChoices] = createSignal<Map<string, string>>(new Map());

    // Quantity controls
    refs.quantity.decrementButton.onclick(() => {
        setQuantity(prev => Math.max(1, prev - 1));
    });

    refs.quantity.incrementButton.onclick(() => {
        setQuantity(prev => prev + 1);
    });

    refs.quantity.quantity.oninput(({event}) => {
        const value = parseInt((event.target as HTMLInputElement).value, 10);
        if (!isNaN(value) && value > 0) {
            setQuantity(value);
        }
    });

    // Handle option choice selection
    refs.options.choices.choiceButton.onclick(({event, viewState, coordinate}) => {
        const choices = new Map(selectedChoices());
        const [optionId, choiceId] = coordinate;
        choices.set(optionId, choiceId);
        setSelectedChoices(choices);
    });

    // Handle add to cart
    refs.addToCartButton.onclick(async () => {
        if (!props.inStock()) {
            console.warn('Product is out of stock');
            return;
        }

        setIsAddingToCart(true);
        try {
            // TODO: Implement cart API call
            await new Promise(resolve => setTimeout(resolve, 500));

            console.log('Adding to cart:', {
                productId: props.productId(),
                quantity: quantity(),
                selectedChoices: Array.from(selectedChoices().entries())
            });
        } catch (error) {
            console.error('Failed to add to cart:', error);
        } finally {
            setIsAddingToCart(false);
        }
    });

    return {
        render: () => ({
            quantity: {
                quantity: quantity(),
            },
            actionsEnabled,
            options,
            modifiers,
            mediaGallery,
            sku,
            price,
            pricePerUnit,
            stockStatus,
            strikethroughPrice,
        })
    };
}

/**
 * Product Page Full-Stack Component
 *
 * A complete headless product page component with server-side rendering,
 * real-time inventory, and client-side interactivity.
 *
 * Usage:
 * ```typescript
 * import { productPage } from '@jay-framework/wix-stores';
 *
 * // The component will automatically load products and render pages
 * ```
 */
export const productPage = makeJayStackComponent<ProductPageContract>()
    .withProps<PageProps>()
    .withInteractive(ProductPageInteractive);

