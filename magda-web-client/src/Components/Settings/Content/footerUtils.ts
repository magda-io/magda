export type FooterSize = "medium" | "small";

export const FOOTER_SIZES: FooterSize[] = ["medium", "small"];

export function isFooterSize(size: string): size is FooterSize {
    return FOOTER_SIZES.indexOf(size as FooterSize) !== -1;
}

/** `medium` is the footer shown on desktop, `small` the one shown on mobile */
export function footerSizeLabel(size: FooterSize) {
    return size === "small" ? "Mobile" : "Desktop";
}

export const footerCategoryIdPrefix = (size: FooterSize) =>
    `footer/navigation/${size}/category/`;

export const footerCategoryLinksIdPrefix = (
    size: FooterSize,
    categoryKey: string
) => `footer/navigation/${size}/category-links/${categoryKey}/`;

export const FOOTER_SETTINGS_BASE_URL = "/settings/content/footer";

export const footerCategoryLinksPageUrl = (
    size: FooterSize,
    categoryKey: string
) =>
    `${FOOTER_SETTINGS_BASE_URL}/${size}/categories/${encodeURIComponent(
        categoryKey
    )}`;
