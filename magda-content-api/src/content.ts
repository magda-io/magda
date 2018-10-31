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

const bodyParser = require("body-parser");
const djv = require("djv");
const env = djv();
const schemas = require("./schemas");
const wildcard = require("wildcard");

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
    "staticPages/*.md": makeMarkdownItem(),
    // BEGIN TEMPORARY UNTIL STORAGE API GETS HERE
    "csv/*": makeSpreadsheetItem({
        route: /\/csv\-[a-z][\w\-]*[a-z]/,
        private: true
    }),
    // END TEMPORARY UNTIL STORAGE API GETS HERE
    // BEGIN EMAIL TEMPLATE STUFF
    emailTemplates: makeHtmlItem({
        route: /\/emailTemplates\/\w+\.html/
    }),
    "emailTemplates/assets/*": makeImageItem(),
    // END EMAIL TEMPLATE STUFF
    "lang/*/*": makeJsonItem({}, { schema: schemas.languageString }),
    "config/datasetSearchSuggestionScoreThreshold": makeJsonItem(
        {},
        { schema: schemas.condigDatasetSearchSuggestionScoreThreshold }
    ),
    "config/searchResultsPerPage": makeJsonItem(
        {},
        { schema: schemas.configSearchResultsPerPage }
    )
};

function makeImageItem(extra: any = {}) {
    return Object.assign(
        {
            body: bodyParser.raw({
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

function makeCssItem(extra: any = {}) {
    return Object.assign(
        {
            body: bodyParser.text({
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
            body: bodyParser.text({
                type: "text/html",
                limit: "1mb"
            })
        },
        extra
    );
}

function makeMarkdownItem(extra: any = {}) {
    return Object.assign(
        {
            body: bodyParser.text({
                type: "text/markdown",
                limit: "5mb"
            })
        },
        extra
    );
}

function makeSpreadsheetItem(extra: any = {}) {
    return Object.assign(
        {
            body: bodyParser.raw({
                type: [
                    "text/csv",
                    "application/vnd.ms-excel",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ],
                limit: "10mb"
            }),
            encode: ContentEncoding.base64
        },
        extra
    );
}

function makeJsonItem(extra: any = {}, options: any = {}) {
    const schemaId = `schema${(env.schemaCount = env.schemaCount || 1)}`;
    env.schemaCount++;
    env.addSchema(schemaId, options.schema || { type: "object" });
    return Object.assign(
        {
            body: bodyParser.json({
                inflate: true,
                strict: false
            }),
            encode: ContentEncoding.json,
            verify: function(req: any, res: any, next: any) {
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

export function findContentItemById(contentId: string): ContentItem {
    const contentItem = Object.entries(content).filter(param => {
        const [key, item] = param;
        return (
            contentId === key || // single item
            (item.route && item.route.test(`/${contentId}`)) || // has custom route
            wildcard(key, contentId) // wildcard item
        );
    });
    return contentItem.length > 0 ? contentItem[0][1] : undefined;
}
