import Schema from "rsuite/Schema";
import { isValidHeaderHref } from "./contentUtils";
import { HighlightFormValue } from "./homeUtils";

const INVALID_URL_MESSAGE =
    "Please enter a site path (e.g. /page/about or /search?q=water) or a full URL (e.g. https://example.com).";

function createUrlType(isRequired: boolean) {
    const type = Schema.Types.StringType();
    return (isRequired
        ? type.isRequired(
              "Please enter the link URL too, or clear the link text."
          )
        : type
    ).addRule((value) => isValidHeaderHref(value), INVALID_URL_MESSAGE);
}

/**
 * The highlight form model.
 * The home page only shows the link when it has both a text & a URL, so both or neither are required.
 * Note: a `when()` callback must return a new type: returning a type with the same `when()` recurses forever.
 */
export default function createHighlightFormModel() {
    return Schema.Model<HighlightFormValue>({
        text: Schema.Types.StringType().when((schema) =>
            schema.url.value?.trim()
                ? Schema.Types.StringType().isRequired(
                      "Please enter the link text too, or clear the link URL."
                  )
                : Schema.Types.StringType()
        ),
        url: Schema.Types.StringType().when((schema) =>
            createUrlType(!!schema.text.value?.trim())
        )
    });
}
