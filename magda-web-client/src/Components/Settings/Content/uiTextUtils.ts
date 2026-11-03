import sortBy from "lodash/sortBy";
import { ContentRecord } from "api-clients/ContentApis";

/**
 * Only English is active at the moment (`src/i18n.js` sets `lng` & `fallbackLng` to "en").
 */
export const UI_TEXT_LANGUAGE = "en";
export const UI_TEXT_LANGUAGE_LABEL = "English (en)";
export const UI_TEXT_ID_PREFIX = `lang/${UI_TEXT_LANGUAGE}/`;

type KnownUiText = {
    // where the text is shown
    description: string;
    // the value seeded by the content DB migrations (`magda-migrator-content-db/sql`)
    defaultValue: string;
};

/**
 * The UI texts used by the code, keyed by `<namespace>/<key>`.
 * Each lookup in the code also has a fallback text, used when the item doesn't exist.
 */
export const KNOWN_UI_TEXTS: { [namespaceAndKey: string]: KnownUiText } = {
    "global/appName": {
        description: "The site name, shown in the header and page titles",
        defaultValue: "Magda"
    },
    "publishersPage/publishersPageTitle": {
        description: "Title of the organisations page",
        defaultValue: "Organisations"
    },
    "publishersPage/publishersBreadCrumb": {
        description: "Breadcrumb of the organisations page",
        defaultValue: "Organisations"
    },
    "publishersPage/publishersSearchPlaceholder": {
        description: "Placeholder of the organisations page search box",
        defaultValue: "Search for Organisations"
    },
    "publishersPage/noPublishersMatchSearchMessage": {
        description:
            "Shown on the organisations page when no organisation matches a search",
        defaultValue:
            "Sorry, we couldn't find any organisations that match your search."
    },
    "publisherPage/publishersBreadCrumb": {
        description: "Breadcrumb of an organisation page",
        defaultValue: "Organisations"
    },
    "publisherPage/publisherNotFoundMessage": {
        description: "Shown when an organisation can't be found",
        defaultValue: "Organisation cannot be found"
    },
    "publisherPage/publisherHasNoDescMessage": {
        description: "Shown on an organisation page with no description",
        defaultValue: "This publisher has no description"
    },
    "datasetPage/accessNotesPrefix": {
        description:
            "Shown before the access notes of a dataset distribution (optional)",
        defaultValue: ""
    },
    "datasetPage/accessNotesSuffix": {
        description:
            "Shown after the access notes of a dataset distribution (optional)",
        defaultValue: ""
    },
    "datasetPage/contactPointTitle": {
        description: "Title of the contact point of a dataset",
        defaultValue: "Contact Point"
    },
    "datasetSuggestForm/suggestSuccessMessage": {
        description: "Shown after a dataset suggestion is submitted",
        defaultValue:
            "Someone from the the organisation that handles the relevant data or this website will get in touch soon. Please note that the time taken to action your request may vary depending on the nature of the request."
    },
    "searchDatasetsPage/publisherFilterTitle": {
        description: "Title of the organisation filter of the dataset search",
        defaultValue: "Organisation"
    }
};

export type UiTextRecord = {
    // the content item id, e.g. `lang/en/global/appName`
    id: string;
    namespace: string;
    key: string;
    // `undefined` when the item doesn't exist (the code's fallback text is shown)
    value?: string;
    description?: string;
    defaultValue?: string;
};

export function uiTextId(namespace: string, key: string): string {
    return `${UI_TEXT_ID_PREFIX}${namespace}/${key}`;
}

/**
 * Parse a UI text item id `lang/<language>/<namespace>/<key>`.
 */
export function parseUiTextId(
    id: string
): { language: string; namespace: string; key: string } | undefined {
    const parts = typeof id === "string" ? id.split("/") : [];
    if (parts.length !== 4 || parts[0] !== "lang" || parts.some((p) => !p)) {
        return undefined;
    }
    const [, language, namespace, key] = parts;
    return { language, namespace, key };
}

/**
 * List the stored UI texts of the language, plus the known texts that aren't stored.
 */
export function buildUiTextRecords(records: ContentRecord[]): UiTextRecord[] {
    const items: { [namespaceAndKey: string]: UiTextRecord } = {};
    for (const [namespaceAndKey, known] of Object.entries(KNOWN_UI_TEXTS)) {
        const [namespace, key] = namespaceAndKey.split("/");
        items[namespaceAndKey] = {
            id: uiTextId(namespace, key),
            namespace,
            key,
            description: known.description,
            defaultValue: known.defaultValue
        };
    }
    for (const record of records) {
        const parsed = parseUiTextId(record?.id);
        if (!parsed || parsed.language !== UI_TEXT_LANGUAGE) {
            continue;
        }
        const namespaceAndKey = `${parsed.namespace}/${parsed.key}`;
        items[namespaceAndKey] = {
            ...(items[namespaceAndKey]
                ? items[namespaceAndKey]
                : {
                      id: record.id,
                      namespace: parsed.namespace,
                      key: parsed.key
                  }),
            value: typeof record.content === "string" ? record.content : ""
        };
    }
    return sortBy(Object.values(items), [
        (item) => item.namespace,
        (item) => item.key
    ]);
}

/** whether the stored text differs from the default value (texts with no default never do) */
export function isUiTextModified(item: UiTextRecord): boolean {
    return (
        typeof item.defaultValue === "string" &&
        typeof item.value === "string" &&
        item.value !== item.defaultValue
    );
}

export function filterUiTextRecords(
    items: UiTextRecord[],
    keyword: string
): UiTextRecord[] {
    const q = typeof keyword === "string" ? keyword.trim().toLowerCase() : "";
    if (!q) {
        return items;
    }
    return items.filter((item) =>
        [item.namespace, item.key, item.value, item.description].some(
            (field) =>
                typeof field === "string" && field.toLowerCase().includes(q)
        )
    );
}
