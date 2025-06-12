import { JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';

export enum MediaType {
    audio,
    document,
    image,
    video,
    zip,
}

export interface Thumbnail {
    altText: string;
    format: string;
    height: string;
    url: string;
    width: string;
}

export interface Image {
    altText: string;
    format: string;
    height: string;
    url: string;
    width: string;
}

export interface Files {
    altText: string;
    format: string;
    height: string;
    url: string;
    width: string;
}

export interface Video {
    files: Array<Files>;
    stillFrameMediaId: string;
}

export interface MediaItemViewState {
    id: string;
    mediaType: MediaType;
    thumbnail: Thumbnail;
    title: string;
    image: Image;
    video: Video;
}

export interface MediaItemRefs {}

export interface MediaItemRepeatedRefs {}

export type MediaItemElement = JayElement<MediaItemViewState, MediaItemRefs>;
export type MediaItemElementRender = RenderElement<
    MediaItemViewState,
    MediaItemRefs,
    MediaItemElement
>;
export type MediaItemElementPreRender = [MediaItemRefs, MediaItemElementRender];

export declare function render(options?: RenderElementOptions): MediaItemElementPreRender;
