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

/**
 * Any encoding we perform on the content.
 */
export enum ContentEncoding {
    base64 // binary content are stored as base64 in the db
}

export interface ContentItem {
    route?: RegExp | string;
    body?: any; // <-- express middleware can go here
    encode?: ContentEncoding;
    contentType?: string;
    private?: boolean;
    /**
     * TODO: if needed, add a schema property for json validation
     * TODO: if needed, add a custom validation callback function
     */
}

export const content: { [s: string]: ContentItem } = {
    "header/logo": makeImageItem(),
    "header/logo-mobile": makeImageItem(),
    "header/menu/*": makeJsonItem(),
    stylesheet: makeCssItem(),
    "/staticPages/*.md": makeMarkdownItem(),
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
    "emailTemplates/assets/*": makeImageItem()
    // END EMAIL TEMPLATE STUFF
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
                inflate: true
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

function makeJsonItem(extra: any = {}) {
    return Object.assign(
        {
            body: bodyParser.json({
                inflate: true
            }),
            encode: ContentEncoding.base64
        },
        extra
    );
}
