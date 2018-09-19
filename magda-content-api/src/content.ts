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
 */

const bodyParser = require("body-parser");

/**
 * Any encoding we perform on the content.
 */
export enum ContentEncoding {
    base64 // binary content are stored as base64 in the db
}

export interface ContentItem {
    route?: RegExp;
    body?: any; // <-- express middleware can go here
    encode?: ContentEncoding;
    contentType?: string;
    /**
     * TODO: if needed, add a schema property for json validation
     * TODO: if needed, add a custom validation callback function
     */
}

const IMAGE_ITEM = {
    body: bodyParser.raw({
        type: [
            "image/png",
            "image/gif",
            "image/jpeg",
            "image/webp",
            "image/svg+xml"
        ]
    }),
    encode: ContentEncoding.base64
};

export const content: { [s: string]: ContentItem } = {
    logo: IMAGE_ITEM,
    "logo-mobile": IMAGE_ITEM,
    stylesheet: {
        body: bodyParser.text({
            type: "text/*",
            limit: "5mb"
        }),
        contentType: "text/css"
    },
    // BEGIN TEMPORARY UNTIL STORAGE API GETS HERE
    csv: {
        route: /^\/(csv-).+$/,
        body: bodyParser.raw({
            type: [
                "text/csv",
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ],
            limit: "10mb"
        }),
        encode: ContentEncoding.base64
    }
    // END TEMPORARY UNTIL STORAGE API GETS HERE
};
