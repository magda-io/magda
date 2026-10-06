import sortBy from "lodash/sortBy";
import uniq from "lodash/uniq";
import {
    ContentRecord,
    FooterCopyrightItem,
    HeaderNavigationItem,
    PageItem
} from "api-clients/ContentApis";

/**
 * Form values of a link (header navigation link / footer link).
 * `rel` is kept as a list in the form and saved as a space separated string.
 */
export type LinkFormValue = {
    label: string;
    href: string;
    openInNewWindow: boolean;
    target: string;
    rel: string[];
};

export type LinkData = {
    label: string;
    href: string;
    target?: string;
    rel?: string;
};

export const DEFAULT_LINK_TARGET = "_blank";

export const HEADER_ITEM_TYPE_LINK = "link";
export const HEADER_ITEM_TYPE_AUTH = "auth";
export type HeaderItemType =
    | typeof HEADER_ITEM_TYPE_LINK
    | typeof HEADER_ITEM_TYPE_AUTH;

export type HeaderNavigationFormValue = LinkFormValue & {
    itemType: HeaderItemType;
    order: number | string;
};

export type FooterCopyrightFormValue = {
    order: number | string;
    href: string;
    logoSrc: string;
    logoAlt: string;
    logoClassName: string;
    htmlContent: string;
};

/**
 * Valid `rel` values for links (`<a rel="...">`).
 * Users may also type in any other value.
 */
export const LINK_REL_VALUES = [
    "noopener",
    "noreferrer",
    "nofollow",
    "external",
    "author",
    "bookmark",
    "help",
    "license",
    "next",
    "prev",
    "search",
    "tag"
];

export function parseRel(rel?: string): string[] {
    if (typeof rel !== "string") {
        return [];
    }
    return uniq(rel.split(/\s+/).filter((item) => !!item));
}

export function linkToFormValue(link?: Partial<LinkData>): LinkFormValue {
    const target = typeof link?.target === "string" ? link.target.trim() : "";
    return {
        label: link?.label ? link.label : "",
        href: link?.href ? link.href : "",
        openInNewWindow: !!target,
        target: target ? target : DEFAULT_LINK_TARGET,
        rel: parseRel(link?.rel)
    };
}

/**
 * Convert link form values to the content shape.
 * Empty `rel` / `target` are left out, as the schemas require them to be non-empty when present.
 */
export function formValueToLink(value: LinkFormValue): LinkData {
    const link: LinkData = {
        label: value.label.trim(),
        href: value.href.trim()
    };
    const rel = uniq(
        (value.rel ? value.rel : [])
            .flatMap((item) => parseRel(item))
            .filter((item) => !!item)
    ).join(" ");
    if (rel.length >= 2) {
        link.rel = rel;
    }
    const target = value.target ? value.target.trim() : "";
    if (value.openInNewWindow) {
        link.target = target ? target : DEFAULT_LINK_TARGET;
    }
    return link;
}

export function toOrderNumber(order: number | string | undefined): number {
    const value = typeof order === "number" ? order : parseFloat(`${order}`);
    return isNaN(value) ? 0 : value;
}

export function isValidOrder(order: number | string | undefined): boolean {
    if (typeof order === "number") {
        return isFinite(order);
    }
    if (typeof order !== "string" || !order.trim()) {
        return false;
    }
    return /^-?\d+(\.\d+)?$/.test(order.trim());
}

export function getNextOrder(records: ContentRecord<{ order?: number }>[]) {
    const orders = records
        .map((item) => item?.content?.order)
        .filter(
            (order): order is number =>
                typeof order === "number" && isFinite(order)
        );
    return orders.length ? Math.floor(Math.max(...orders)) + 1 : 1;
}

export function emptyHeaderNavigationFormValue(
    order: number = 1
): HeaderNavigationFormValue {
    return {
        ...linkToFormValue(),
        itemType: HEADER_ITEM_TYPE_LINK,
        order
    };
}

export function headerNavigationToFormValue(
    item: HeaderNavigationItem
): HeaderNavigationFormValue {
    return {
        ...linkToFormValue(item?.default),
        itemType: item?.auth ? HEADER_ITEM_TYPE_AUTH : HEADER_ITEM_TYPE_LINK,
        order: typeof item?.order === "number" ? item.order : 1
    };
}

export function formValueToHeaderNavigation(
    value: HeaderNavigationFormValue
): HeaderNavigationItem {
    const order = toOrderNumber(value.order);
    if (value.itemType === HEADER_ITEM_TYPE_AUTH) {
        return { order, auth: {} };
    }
    return { order, default: formValueToLink(value) };
}

/**
 * A header link must be a site path (e.g. `/page/about`), an absolute URL or a `mailto:` link.
 */
export function isValidHeaderHref(href: string): boolean {
    const value = typeof href === "string" ? href.trim() : "";
    if (!value || /\s/.test(value)) {
        return false;
    }
    return (
        value[0] === "/" ||
        /^(https?|ftp):\/\/[^/]+/i.test(value) ||
        /^mailto:[^@]+@[^@]+$/i.test(value)
    );
}

export function emptyFooterCopyrightFormValue(
    order: number = 1
): FooterCopyrightFormValue {
    return {
        order,
        href: "",
        logoSrc: "",
        logoAlt: "",
        logoClassName: "",
        htmlContent: ""
    };
}

export function footerCopyrightToFormValue(
    item: FooterCopyrightItem
): FooterCopyrightFormValue {
    return {
        order: typeof item?.order === "number" ? item.order : 1,
        href: item?.href ? item.href : "",
        logoSrc: item?.logoSrc ? item.logoSrc : "",
        logoAlt: item?.logoAlt ? item.logoAlt : "",
        logoClassName: item?.logoClassName ? item.logoClassName : "",
        htmlContent: item?.htmlContent ? item.htmlContent : ""
    };
}

export function formValueToFooterCopyright(
    value: FooterCopyrightFormValue
): FooterCopyrightItem {
    return {
        order: toOrderNumber(value.order),
        href: value.href.trim(),
        logoSrc: value.logoSrc.trim(),
        // the footer renders `"logo " + logoClassName`, so always save a string
        logoClassName: value.logoClassName.trim(),
        logoAlt: value.logoAlt.trim(),
        htmlContent: value.htmlContent
    };
}

export const PAGE_ID_PREFIX = "page/";
export const PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

export function pageIdToSlug(pageId: string): string {
    return pageId.indexOf(PAGE_ID_PREFIX) === 0
        ? pageId.substring(PAGE_ID_PREFIX.length)
        : pageId;
}

/**
 * Validate a new page slug. Returns an error message or `undefined` if the slug is valid.
 */
export function validatePageSlug(
    slug: string,
    existingSlugs: string[] = []
): string | undefined {
    const value = typeof slug === "string" ? slug.trim() : "";
    if (!value) {
        return "Page URL slug is required.";
    }
    if (!PAGE_SLUG_PATTERN.test(value)) {
        return "Only lowercase letters, numbers, hyphens and underscores can be used, and it must start and end with a letter or number.";
    }
    if (existingSlugs.indexOf(value) !== -1) {
        return `A page with URL slug "${value}" already exists.`;
    }
    return undefined;
}

export function formValueToPage(title: string, content: string): PageItem {
    const page: PageItem = { title: title.trim() };
    // the schema requires `content` to be non-empty when present
    if (typeof content === "string" && content.trim()) {
        page.content = content;
    }
    return page;
}

export function sortByOrder<T extends { order?: number }>(
    records: ContentRecord<T>[]
): ContentRecord<T>[] {
    return sortBy(records, [
        (item) =>
            typeof item?.content?.order === "number"
                ? item.content.order
                : Number.MAX_SAFE_INTEGER,
        (item) => item.id
    ]);
}

export type OrderUpdate = { id: string; order: number };

/**
 * Work out the `order` changes needed to move the item at `index` one position up (-1) or down (1)
 * in a list sorted by order.
 * When all orders are distinct, the two items swap their orders.
 * Otherwise, the whole list is renumbered (1, 2, 3...) so the new position is unambiguous.
 */
export function computeMoveOrderUpdates(
    records: ContentRecord<{ order?: number }>[],
    index: number,
    direction: -1 | 1
): OrderUpdate[] {
    const targetIndex = index + direction;
    if (
        index < 0 ||
        index >= records.length ||
        targetIndex < 0 ||
        targetIndex >= records.length
    ) {
        return [];
    }
    const orders = records.map((item) => item?.content?.order);
    const allDistinct =
        orders.every((order) => typeof order === "number") &&
        uniq(orders).length === orders.length;
    const current = records[index];
    const target = records[targetIndex];
    if (allDistinct) {
        return [
            { id: current.id, order: target.content!.order as number },
            { id: target.id, order: current.content!.order as number }
        ];
    }
    const reordered = [...records];
    reordered[index] = target;
    reordered[targetIndex] = current;
    return reordered
        .map((item, idx) => ({
            id: item.id,
            order: idx + 1,
            changed: item?.content?.order !== idx + 1
        }))
        .filter((item) => item.changed)
        .map(({ id, order }) => ({ id, order }));
}

export function getLastIdSegment(id: string): string {
    const parts = id.split("/");
    return parts[parts.length - 1];
}
