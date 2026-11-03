import React, { FunctionComponent } from "react";
import { FooterCopyrightItem } from "api-clients/ContentApis";

/**
 * Preview of a footer copyright item, using the same markup as the site footer.
 * Like the site footer, `htmlContent` is rendered as is: only admins can edit it.
 */
const FooterCopyrightPreview: FunctionComponent<{
    item: Partial<FooterCopyrightItem>;
    compact?: boolean;
}> = ({ item, compact }) => (
    <div
        className={`footer-copyright-preview ${
            compact ? "footer-copyright-preview-compact" : ""
        }`}
    >
        <div
            className="copyright-text"
            dangerouslySetInnerHTML={{
                __html: item?.htmlContent ? item.htmlContent : ""
            }}
        />
        {item?.logoSrc ? (
            <a
                href={item?.href}
                target="_blank"
                rel="noopener noreferrer"
                className="logo-link"
            >
                <img
                    src={item.logoSrc}
                    className={`logo ${
                        item?.logoClassName ? item.logoClassName : ""
                    }`}
                    alt={item?.logoAlt}
                />
            </a>
        ) : null}
    </div>
);

export default FooterCopyrightPreview;
