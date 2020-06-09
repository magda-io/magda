import i18n from "i18next";
import { reactI18nextModule } from "react-i18next";
import { config } from "./config";
import fromPairs from "lodash/fromPairs";
import groupBy from "lodash/groupBy";
import mapValues from "lodash/mapValues";
import throttle from "lodash/throttle";
import uniq from "lodash/uniq";
import get from "lodash/get";

/**
 * The minimum interval between which to make requests to the content api for new strings. If i18next asks
 * for new strings in between intervals, they're queued up and retrieved in a single request at the end of
 * the interval.
 */
const FETCH_BATCH_INTERVAL = 100;

/**
 * i18next backend plugin that loads from the Magda Content API. Automatically caches fetch promises
 * and batches requests to reduce request overhead.
 */
class MagdaContentAPIBackend {
    /** Tells i18next what kind of plugin this is */
    type = "backend";

    /**
     * A buffer of namespace/lang pairs that still need to be retrieved from the server. Will be retrieved
     * and cached when processBuffer() executes.
     */
    requestBuffer = [];

    /**
     * A cache of language/namespace pairs with the promise for their retrieval. Populated as requests
     * are made. Represented as an object of language to an object of namespace to promise.
     */
    cache = {};

    /**
     * Get a namespace for a language - called directly by i18next
     *
     * @param language {string} the language to use
     * @param namespace {string} the namespace to get for that language
     * @param callback {function} A callback that will be called when the lang/ns combo
     *      has finished being retrieved.
     */
    read(language, namespace, callback) {
        this.getFromCache(language, namespace)
            .then((data) => {
                callback(null, data);
            })
            .catch((err) => callback(err));
    }

    /**
     * Gets a language/namespace combo from the cache if possible, or the server if not.
     * Caches the promise for anything it has to get from the server so repeat requests
     * should never happen for the same lang/ns pair.
     *
     * @returns A promise that returns the data for that lang/ns pair
     */
    getFromCache(language, namespace) {
        const existingValue = get(this.cache, `${language}.${namespace}`, null);

        if (existingValue !== null) {
            return existingValue;
        } else {
            const promise = new Promise((resolve, reject) => {
                this.requestBuffer.push({
                    language,
                    namespace,
                    callback: (err, data) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(data);
                        }
                    }
                });
                this.requestProcessBuffer();
            });

            if (!this.cache[language]) {
                this.cache[language] = {};
            }

            this.cache[language][namespace] = promise;

            return promise;
        }
    }

    /**
     * Schedules the retrieval of uncached strings in the request buffer. Executes every
     * FETCH_BATCH_INTERVAL seconds
     */
    requestProcessBuffer = throttle(this.processBuffer, FETCH_BATCH_INTERVAL, {
        leading: false,
        trailing: true
    });

    /**
     * Processes the current request buffer by making one request for all the unresolved strings
     * currently inside it. Will clear the buffer.
     */
    async processBuffer() {
        const groupedByLanguages = groupBy(this.requestBuffer, "language");
        /** Lookup of callbacks, grouped by languages and then namespaces */
        const callbackLookup = mapValues(groupedByLanguages, (langItems) =>
            mapValues(groupBy(langItems, "namespace"), (items) =>
                items.map((item) => item.callback)
            )
        );

        const langNsCombos = uniq(
            this.requestBuffer.map(({ language, namespace }) => ({
                language,
                namespace
            }))
        );

        this.requestBuffer = [];
        let data, err;
        try {
            data = await MagdaContentAPIBackend.getStrings(langNsCombos);
        } catch (e) {
            console.error(e);
            err = e;
        }

        for (const langNsCombo of langNsCombos) {
            const { language, namespace } = langNsCombo;
            const callbacks = get(
                callbackLookup,
                `${language}.${namespace}`,
                []
            );
            for (const callback of callbacks) {
                if (err) {
                    callback(err);
                } else {
                    const namespaceData =
                        data[language] && data[language][namespace];
                    callback(null, namespaceData);
                }
            }
        }
    }

    /**
     * Gets strings from the content API.
     *
     * @param {*} langNsCombos Combination of language and namespaces to retrieve.
     */
    static async getStrings(langNsCombos) {
        const baseUrl = config.contentApiURL + "/all?inline=true&";
        const ids = langNsCombos.map(
            ({ language, namespace }) => `id=lang/${language}/${namespace}/*`
        );

        const res = await fetch(baseUrl + ids.join("&"));
        if (res.status !== 200) {
            throw new Error(
                `Could not get copy text for ${JSON.stringify(langNsCombos)}: ${
                    res.status
                }: ${res.statusText}`
            );
        }

        // The JSON will be a flat list, e.g.
        // [{"id":"lang/en/publisherPage/publisherBreadCrumb","content":"Organisations"}]
        const json = await res.json();

        // We need it to be structured like:
        // {
        //     en: {
        //         publisherPage: {
        //             publisherBreadCrumb: "Organisations"
        //         }
        //     }
        // };
        const withSplitPaths = json.map((item) => ({
            ...item,
            path: item.id.split("/")
        }));

        const groupedByLanguage = groupBy(
            withSplitPaths,
            (item) => item.path[1]
        );

        return mapValues(groupedByLanguage, (itemsInLanguage) => {
            const groupedByNamespace = groupBy(
                itemsInLanguage,
                (item) => item.path[2]
            );

            return mapValues(groupedByNamespace, (namespaceItems) =>
                fromPairs(
                    namespaceItems.map((item) => [item.path[3], item.content])
                )
            );
        });
    }
}

i18n.use(reactI18nextModule) // passes i18n down to react-i18next
    .use(new MagdaContentAPIBackend())
    .init({
        react: {
            // Stop events on the store causing loads of re-renders
            bindStore: false,
            bindI18n: false
        },
        lng: "en",
        // We set these because for some reason i18next always wants to load a default
        // NS - if we don't provide it, it'll fall back to "translation"
        ns: "global",
        defaultNS: "global",
        fallbackNS: "global",
        fallbackLng: "en",
        load: "languageOnly",
        interpolation: {
            escapeValue: false // react already safe from xss
        }
    });

export default i18n;
