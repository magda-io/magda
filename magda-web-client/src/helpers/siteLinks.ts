import { MouseEvent } from "react";

/**
 * Whether a site path points to a backend API (`/api/*` or `/auth/*`), possibly with a prefix path
 * (e.g. `/magda/api/v0/apidocs/index.html`), rather than a UI route.
 * Same rule as `CommonLink` uses.
 */
export function isBackendPath(href: string): boolean {
    return (
        typeof href === "string" &&
        !!href
            .trim()
            .toLowerCase()
            .match(/^(\/[^/]*)*?\/(api|auth)\//)
    );
}

const externalUrlRegex = /^(https?|ftp):\/\//i;

export function isExternalUrl(href: string): boolean {
    return typeof href === "string" && externalUrlRegex.test(href.trim());
}

/**
 * Whether clicking a link with this target is handled within the current window
 * (react-router only handles a click in-app when there is no target or the target is `_self`).
 */
export function opensInCurrentWindow(target?: string): boolean {
    return !target || target === "_self";
}

/**
 * Click handler that forces a full page load, for site paths that are not UI routes (e.g. `/api/*`).
 * Otherwise react-router would handle the click in-app and show its "not found" page.
 */
export function fullPageLoadOnClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) {
        // let the browser handle e.g. "open in new tab"
        return;
    }
    e.preventDefault();
    window.location.assign(e.currentTarget.href);
}

export type FooterLinkData = {
    href: string;
    target?: string;
    rel?: string;
};

export type FooterLinkProps = {
    href: string;
    target?: string;
    rel?: string;
    // the link points to a backend path & opens in the current window: needs a full page load
    fullPageLoad: boolean;
};

/**
 * Work out how a footer link (other than `mailto:` & `feedback` links) is rendered.
 *
 * `target` & `rel` are used when set. Otherwise:
 * - full URLs and backend paths (`/api/*`, `/auth/*`) open in a new window
 * - other site paths open in the same window
 * Links opening in a new window get `rel="noopener noreferrer"` unless `rel` is set.
 * A site path not starting with `/` (e.g. `page/about`) is treated as relative to the site root.
 */
export function getFooterLinkProps(link: FooterLinkData): FooterLinkProps {
    const rawHref = typeof link?.href === "string" ? link.href.trim() : "";
    const isExternal = isExternalUrl(rawHref);
    const href =
        isExternal || rawHref[0] === "/" ? rawHref : `/${encodeURI(rawHref)}`;
    const isBackend = !isExternal && isBackendPath(href);

    const customTarget =
        typeof link?.target === "string" ? link.target.trim() : "";
    const target = customTarget
        ? customTarget
        : isExternal || isBackend
        ? "_blank"
        : undefined;

    const customRel = typeof link?.rel === "string" ? link.rel.trim() : "";
    const rel = customRel
        ? customRel
        : target === "_blank"
        ? "noopener noreferrer"
        : undefined;

    return {
        href,
        target,
        rel,
        fullPageLoad: isBackend && opensInCurrentWindow(target)
    };
}
