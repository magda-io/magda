import { config } from "../config";
import request from "../helpers/request";
import getRequest from "../helpers/getRequest";
import createNoCacheFetchOptions from "./createNoCacheFetchOptions";
import ServerError from "@magda/typescript-common/dist/ServerError.js";

/**
 * Header navigation item (`header/navigation/*`).
 * Either a regular link (`default`) or the authentication menu (`auth`).
 * See `magda-content-schemas/header-navigation.schema.json`.
 */
export interface HeaderNavigationItem {
    order: number;
    default?: {
        label: string;
        href: string;
        rel?: string;
        target?: string;
    };
    auth?: Record<string, never>;
}

/** `footer/navigation/{medium,small}/category/*` */
export interface FooterCategoryItem {
    order: number;
    label: string;
}

/** `footer/navigation/{medium,small}/category-links/<categoryId>/*` */
export interface FooterLinkItem {
    order: number;
    label: string;
    href: string;
    target?: string;
    rel?: string;
}

/** `footer/copyright/*` */
export interface FooterCopyrightItem {
    order: number;
    href: string;
    logoSrc: string;
    logoClassName?: string;
    logoAlt?: string;
    htmlContent: string;
}

/** `page/*` */
export interface PageItem {
    title: string;
    content?: string;
}

export interface ContentRecord<T = any> {
    id: string;
    type: string;
    length?: number;
    content?: T;
}

function contentUrl(contentId: string) {
    return config.contentApiBaseUrl + contentId;
}

/**
 * Query content items by id pattern(s). e.g. `footer/copyright/*`.
 * JSON items are returned with their content inlined.
 */
export async function queryContent<T = any>(
    idPatterns: string | string[],
    noCache: boolean = true
): Promise<ContentRecord<T>[]> {
    const patterns = Array.isArray(idPatterns) ? idPatterns : [idPatterns];
    const qs = patterns.map((id) => `id=${encodeURIComponent(id)}`).join("&");
    const results = await getRequest<ContentRecord<T>[]>(
        contentUrl(`all?inline=true&${qs}`),
        noCache
    );
    return results?.length ? results : [];
}

export async function getContent<T = any>(
    contentId: string,
    noCache: boolean = true
): Promise<T> {
    return await getRequest<T>(contentUrl(contentId), noCache);
}

/**
 * Fetch a binary content item (e.g. `header/logo`) as a Blob.
 * Returns `null` when the item doesn't exist.
 */
export async function getContentBlob(
    contentId: string,
    noCache: boolean = true
): Promise<Blob | null> {
    const fetchOptions = noCache
        ? createNoCacheFetchOptions(config.commonFetchRequestOptions)
        : config.commonFetchRequestOptions;
    const res = await fetch(contentUrl(contentId), fetchOptions);
    if (res.status === 404) {
        return null;
    }
    if (!res.ok) {
        throw new ServerError(
            `Failed to fetch content item ${contentId}: ${await res.text()}`,
            res.status
        );
    }
    return await res.blob();
}

/**
 * Create or replace a content item.
 * JSON items are validated by the content API against their schemas.
 */
export async function writeContent(
    contentId: string,
    content: any,
    mimeType: string = "application/json"
) {
    return await request<{ result: "SUCCESS" }>(
        "PUT",
        contentUrl(contentId),
        content,
        mimeType
    );
}

export async function deleteContent(contentId: string) {
    return await request<{ result: "SUCCESS" }>(
        "DELETE",
        contentUrl(contentId)
    );
}
