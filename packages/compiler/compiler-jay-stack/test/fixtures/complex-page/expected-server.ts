import {
    makeJayStackComponent,
    notFound,
    PageProps,
    partialRender,
    SlowlyRenderResult,
    UrlParams,
} from '@jay-framework/fullstack-component';
import {
    ChoiceType,
    InfoSectionOfProductPageViewState,
    ModifierType,
    OptionRenderType,
    ProductPageContract,
    ProductPageFastViewState,
    ProductPageSlowViewState,
    ProductType,
    SeoDatumOfProductPageViewState,
    StockStatus,
// @ts-ignore
} from '../contracts/product-page.jay-contract?jay-server';
import {
    WixStoresContext,
    WIX_STORES_SERVICE_MARKER,
// @ts-ignore
} from '../stores-client/wix-stores-context?jay-server';
import {
    ChoiceTypeWithLiterals,
    ConnectedModifier,
    ConnectedOption,
    InfoSection,
    Media,
    MediaTypeWithLiterals,
    ModifierRenderTypeWithLiterals,
    SeoSchema,
// @ts-ignore
} from '@wix/auto_sdk_stores_products-v-3';
import {
    MediaGalleryViewState,
    Selected,
// @ts-ignore
} from '../contracts/media-gallery.jay-contract?jay-server';
//@ts-ignore
import { MediaType } from '../contracts/media.jay-contract?jay-server';
/**
 * URL parameters for product page routes
 * Supports dynamic routing like /products/[slug]
 */
export interface ProductPageParams extends UrlParams {
    slug: string;
}
/**
 * Data carried forward from slow rendering to fast rendering
 */
interface ProductSlowCarryForward {
    productId: string;
    mediaGallery: MediaGalleryViewState;
    options: ProductPageFastViewState['options'];
    modifiers: ProductPageFastViewState['modifiers'];
    sku: string;
    price: string;
    strikethroughPrice: string;
    pricePerUnit: string;
    stockStatus: StockStatus;
}
/**
 * Data carried forward from fast rendering to interactive phase
 */
interface ProductFastCarryForward {
    defaultVS: ProductPageFastViewState;
}
/**
 * Load product slugs for static site generation
 * This function yields all product slugs to generate pages for.
 */
async function* loadProductParams([wixStores]: [WixStoresContext]): AsyncIterable<
    ProductPageParams[]
> {
    try {
        const { items } = await wixStores.products.queryProducts().find();
        yield items.map((product) => ({ slug: product.slug }));
    } catch (error) {
        console.error('Failed to load product slugs:', error);
        yield [];
    }
}
function mapProductType(productType: string): ProductType {
    return productType === 'DIGITAL' ? ProductType.DIGITAL : ProductType.PHYSICAL;
}
function mapInfoSections(infoSections: InfoSection[]): Array<InfoSectionOfProductPageViewState> {
    return infoSections.map((infoSection) => ({
        id: infoSection._id,
        plainDescription: infoSection.plainDescription || '',
        title: infoSection.title || '',
        uniqueName: infoSection.uniqueName || '',
    }));
}
function mapSeoData(seoData: SeoSchema): SeoDatumOfProductPageViewState {
    return {
        tags: seoData.tags.map((tag) => ({
            type: tag.type,
            props: Object.entries(tag.props).map(([key, value]) => ({ key, value })),
            meta: Object.entries(tag.meta).map(([key, value]) => ({ key, value })),
            children: tag.children,
        })),
        settings: {
            preventAutoRedirect: seoData.settings?.preventAutoRedirect || false,
            keywords: seoData.settings.keywords.map((keyword) => ({
                isMain: keyword.isMain,
                origin: keyword.origin,
                term: keyword.term,
            })),
        },
    };
}
function formatWixMediaUrl(
    _id: string,
    url: string,
    mediaType: MediaType,
    resize?: {
        w: number;
        h: number;
    },
) {
    if (url) return url;
    else if (mediaType === MediaType.IMAGE) return `https://static.wixstatic.com/media/${_id}`;
    else if (mediaType === MediaType.VIDEO) return `https://static.wixstatic.com/media/${_id}`;
}
function mapMediaType(mediaType: MediaTypeWithLiterals): MediaType {
    if (mediaType === 'VIDEO') return MediaType.VIDEO;
    else return MediaType.IMAGE;
}
function mapMedia(media: Media): MediaGalleryViewState {
    const mainMediaType = mapMediaType(media.main.mediaType);
    return {
        selectedMedia: {
            url: formatWixMediaUrl(media.main._id, media.main.url, mainMediaType),
            mediaType: mainMediaType,
            thumbnail_50x50: formatWixMediaUrl(media.main._id, media.main.url, mainMediaType, {
                w: 50,
                h: 50,
            }),
        },
        availableMedia:
            media.itemsInfo?.items?.map((item) => ({
                media: {
                    url: formatWixMediaUrl(item._id, item.url, mainMediaType),
                    mediaType: item.mediaType === 'IMAGE' ? MediaType.IMAGE : MediaType.VIDEO,
                    thumbnail_50x50: formatWixMediaUrl(item._id, item.url, mainMediaType, {
                        w: 50,
                        h: 50,
                    }),
                },
                selected: item.url === media.main.url ? Selected.selected : Selected.notSelected,
            })) ?? [],
    };
}
function mapOptionsToSlowVS(options: ConnectedOption[]): ProductPageSlowViewState['options'] {
    return (
        options?.map((option) => ({
            name: option.name,
            optionRenderType:
                option.optionRenderType === 'TEXT_CHOICES'
                    ? OptionRenderType.TEXT_CHOICES
                    : OptionRenderType.COLOR_SWATCH_CHOICES,
            id: option._id,
            choices:
                option.choicesSettings?.choices?.map((choice) => ({
                    name: choice.name,
                    choiceId: choice.choiceId,
                    choiceType:
                        choice.choiceType === 'CHOICE_TEXT'
                            ? ChoiceType.CHOICE_TEXT
                            : ChoiceType.ONE_COLOR,
                    inStock: choice.inStock,
                    colorCode: choice.colorCode,
                })) ?? [],
        })) ?? []
    );
}
function mapOptionsToFastVS(options: ConnectedOption[]): ProductPageFastViewState['options'] {
    return (
        options?.map((option) => ({
            textChoiceSelection: undefined,
            choices:
                option.choicesSettings?.choices?.map((choice) => ({
                    isSelected: false,
                })) ?? [],
        })) ?? []
    );
}
function mapModifierType(modifierRenderType: ModifierRenderTypeWithLiterals): ModifierType {
    switch (modifierRenderType) {
        case 'FREE_TEXT':
            return ModifierType.FREE_TEXT;
        case 'TEXT_CHOICES':
            return ModifierType.TEXT_CHOICES;
        case 'SWATCH_CHOICES':
            return ModifierType.COLOR_SWATCH_CHOICES;
        default:
            return ModifierType.FREE_TEXT;
    }
}
function mapModifierChoiceType(choiceType: ChoiceTypeWithLiterals): ChoiceType {
    if (choiceType === 'ONE_COLOR') return ChoiceType.ONE_COLOR;
    else return ChoiceType.CHOICE_TEXT;
}
function mapModifiersToSlowVS(
    modifiers: ConnectedModifier[],
): ProductPageSlowViewState['modifiers'] {
    return (
        modifiers?.map((modifier) => ({
            name: modifier.name || modifier.freeTextSettings?.title || '',
            id: modifier._id,
            modifierType: mapModifierType(modifier.modifierRenderType),
            textInputLength: modifier.freeTextSettings?.maxCharCount,
            textInputRequired: modifier.mandatory,
            choices:
                modifier.choicesSettings?.choices?.map((choice) => ({
                    name: choice.name,
                    choiceId: choice.choiceId,
                    colorCode: choice.colorCode,
                    choiceType: mapModifierChoiceType(choice.choiceType),
                })) ?? [],
        })) ?? []
    );
}
function mapModifiersToFastVS(
    modifiers: ConnectedModifier[],
): ProductPageFastViewState['modifiers'] {
    return (
        modifiers?.map((modifier) => ({
            textModifierSelection: undefined,
            choices:
                modifier.choicesSettings?.choices?.map((choice) => ({
                    isSelected: false,
                })) ?? [],
        })) ?? []
    );
}
/**
 * Slow Rendering Phase
 * Loads semi-static product data that doesn't change often:
 * - Product details (name, description, SKU)
 * - Media (images, videos)
 * - Options and variants
 * - Categories and breadcrumbs
 * - Brand and metadata
 */
async function renderSlowlyChanging(
    props: PageProps & ProductPageParams,
    wixStores: WixStoresContext,
): Promise<SlowlyRenderResult<ProductPageSlowViewState, ProductSlowCarryForward>> {
    try {
        // Query product by slug with required fields
        const { product } = await wixStores.products.getProductBySlug(props.slug);
        const {
            _id,
            name,
            plainDescription,
            options,
            modifiers,
            actualPriceRange,
            compareAtPriceRange,
            currency,
            media,
            productType,
            handle,
            visible,
            visibleInPos,
            brand,
            ribbon,
            mainCategoryId,
            breadcrumbsInfo,
            allCategoriesInfo,
            directCategoriesInfo,
            infoSections,
            seoData,
            physicalProperties,
            taxGroupId,
            variantSummary,
            _createdDate,
            _updatedDate,
            revision,
        } = product;
        return partialRender<ProductPageSlowViewState, ProductSlowCarryForward>(
            {
                id: _id,
                productName: name || '',
                description: plainDescription,
                brand: brand.name || '',
                ribbon: ribbon.name || '',
                productType: mapProductType(productType),
                options: mapOptionsToSlowVS(options),
                infoSections: mapInfoSections(infoSections),
                modifiers: mapModifiersToSlowVS(modifiers),
                seoData: mapSeoData(seoData),
            },
            {
                productId: product._id || '',
                mediaGallery: mapMedia(media),
                options: mapOptionsToFastVS(options),
                modifiers: mapModifiersToFastVS(modifiers),
                sku: 'N/A not in API',
                price: product.actualPriceRange?.minValue?.formattedAmount || '',
                strikethroughPrice:
                    product.actualPriceRange?.minValue?.amount !==
                    product.compareAtPriceRange?.minValue?.amount
                        ? product.compareAtPriceRange?.minValue?.formattedAmount || ''
                        : '',
                pricePerUnit: product.physicalProperties?.pricePerUnitRange?.minValue?.description,
                stockStatus:
                    product.inventory?.availabilityStatus === 'IN_STOCK'
                        ? StockStatus.IN_STOCK
                        : StockStatus.OUT_OF_STOCK,
            },
        );
    } catch (error) {
        console.error('Failed to render product page (slow):', error);
        return notFound();
    }
}
/**
 * Fast Rendering Phase
 * Loads frequently changing data:
 * - Real-time inventory status
 * - Current variant availability
 * - Dynamic pricing (if applicable)
 */
async function renderFastChanging(
    props: PageProps & ProductPageParams,
    carryForward: ProductSlowCarryForward,
    wixStores: WixStoresContext,
) {
    const fastVS: ProductPageFastViewState = {
        actionsEnabled: false,
        options: carryForward.options,
        modifiers: carryForward.modifiers,
        mediaGallery: carryForward.mediaGallery,
        sku: carryForward.sku,
        price: carryForward.price,
        pricePerUnit: carryForward.pricePerUnit,
        stockStatus: carryForward.stockStatus,
        strikethroughPrice: carryForward.strikethroughPrice,
        quantity: { quantity: 1 },
    };
    return partialRender<ProductPageFastViewState, ProductFastCarryForward>(fastVS, {
        defaultVS: fastVS,
    });
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
    .withServices(WIX_STORES_SERVICE_MARKER)
    .withLoadParams(loadProductParams)
    .withSlowlyRender(renderSlowlyChanging)
    .withFastRender(renderFastChanging);
