/**
 * We configure a list of assets we maintain here.
 */

/**
 * @apiDefine Content Content API
 *
 * Contents are dynamically configurable assets which are persisted in a
 * database. They are intended to support the magda UI/client.
 * They are identified by a string content id (e.g. "logo").
 * They are all encoded as text prior to storage in database and
 * are decoded prior to serving.
 *
 * The following content items (ids) are currently present:
 *
 * * "logo" - site logo - a png, gif, jpeg, webp or svg image - encoded as base64.
 * * "logo-mobile" - site logo - a png, gif, jpeg, webp or svg image - encoded as base64.
 * * "stylesheet" - site css style
 * * "csv-*" - data csvs
 */
import { require } from "@magda/esm-utils";
import express from "express";
import djv from "djv";
const env = djv();
import * as schemas from "@magda/content-schemas";
const wildcard = require("wildcard");

let schemaCount = 0;

/**
 * Any encoding we perform on the content.
 */
export enum ContentEncoding {
    base64, // binary content are stored as base64 in the db
    json
}

export interface ContentItem {
    route?: RegExp;
    body?: any; // <-- express middleware can go here
    encode?: ContentEncoding;
    contentType?: string;
    private?: boolean;
    verify?: any; // <-- express middleware can go here
}

export const content: { [s: string]: ContentItem } = {
    "header/logo": makeImageItem(),
    "header/logo-mobile": makeImageItem(),
    "header/navigation/*": makeJsonItem(
        {},
        { schema: schemas.headerNavigation }
    ),
    "footer/navigation/small/category/*": makeJsonItem(
        {},
        { schema: schemas.footerCategory }
    ),
    "footer/navigation/medium/category/*": makeJsonItem(
        {},
        { schema: schemas.footerCategory }
    ),
    "footer/navigation/small/category-links/*": makeJsonItem(
        {},
        { schema: schemas.footerLink }
    ),
    "footer/navigation/medium/category-links/*": makeJsonItem(
        {},
        { schema: schemas.footerLink }
    ),
    "footer/copyright/*": makeJsonItem({}, { schema: schemas.footerCopyright }),
    "home/tagline/desktop": makeJsonItem({}, { schema: schemas.homeTagLine }),
    "home/tagline/mobile": makeJsonItem({}, { schema: schemas.homeTagLine }),
    "home/highlights/*": makeJsonItem({}, { schema: schemas.homeHighlight }),
    "home/highlight-images/*": makeImageItem(),
    "home/stories/*": makeJsonItem({}, { schema: schemas.homeStory }),
    "home/story-images/*": makeImageItem(),
    stylesheet: makeCssItem(),
    "page/*": makeJsonItem({}, { schema: schemas.page }),
    // BEGIN EMAIL TEMPLATE STUFF
    emailTemplates: makeHtmlItem({
        route: /\/emailTemplates\/\w+\.html/
    }),
    "emailTemplates/assets/*": makeImageItem(),
    // END EMAIL TEMPLATE STUFF
    "lang/*": makeTextItem({}),
    "config/datasetSearchSuggestionScoreThreshold": makeJsonItem(
        {},
        { schema: schemas.configDatasetSearchSuggestionScoreThreshold }
    ),
    "config/searchResultsPerPage": makeJsonItem(
        {},
        { schema: schemas.configSearchResultsPerPage }
    ),
    "favicon.ico": makeIconItem()
};

function makeImageItem(extra: any = {}) {
    return Object.assign(
        {
            body: express.raw({
                type: [
                    "image/png",
                    "image/gif",
                    "image/jpeg",
                    "image/webp",
                    "image/svg+xml"
                ],
                inflate: true,
                limit: "10mb"
            }),
            encode: ContentEncoding.base64
        },
        extra
    );
}

function makeIconItem(extra: any = {}) {
    return Object.assign(
        {
            body: express.raw({
                type: "image/x-icon",
                inflate: true,
                limit: "10mb"
            }),
            encode: ContentEncoding.base64
        },
        extra
    );
}

function makeCssItem(extra: any = {}) {
    return Object.assign(
        {
            body: express.text({
                type: "text/css",
                limit: "5mb"
            })
        },
        extra
    );
}

function makeHtmlItem(extra: any = {}) {
    return Object.assign(
        {
            body: express.text({
                type: "text/html",
                limit: "1mb"
            })
        },
        extra
    );
}

function makeJsonItem(extra: any = {}, options: any = {}) {
    const schemaId = `schema${schemaCount}`;
    schemaCount++;
    env.addSchema(schemaId, options.schema || { type: "object" });
    return Object.assign(
        {
            body: express.json({
                inflate: true,
                strict: false
            }),
            encode: ContentEncoding.json,
            verify: function (req: any, res: any, next: any) {
                const invalid = env.validate(schemaId, req.body);
                if (!invalid) {
                    next();
                } else {
                    res.status(500).json({
                        result: "FAILED",
                        invalid,
                        schema: options.schema,
                        content: req.body
                    });
                }
            }
        },
        extra
    );
}
function makeTextItem(extra: any = {}) {
    return Object.assign(
        {
            body: express.text({
                type: "text/plain",
                limit: "1mb"
            })
        },
        extra
    );
}

const contentEntries = Object.entries(content);
export function findContentItemById(contentId: string): ContentItem {
    const contentItemById = content[contentId];

    if (contentItemById) {
        return contentItemById;
    }

    const contentItemByProperties = contentEntries.find(([key, item]) => {
        return (
            (item.route && item.route.test(`/${contentId}`)) || // has custom route
            wildcard(key, contentId) // wildcard item
        );
    });

    return contentItemByProperties && contentItemByProperties[1];
}
