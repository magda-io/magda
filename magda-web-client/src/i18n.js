import i18n from "i18next";
import { reactI18nextModule } from "react-i18next";
// the translations
// (tip move them in a JSON file and import them)
const resources = {
    en: {
        translation: {
            publisherPage: {
                breadCrumb: "Welcome to React and react-i18next"
            }
        }
    }
};

const backend = {
    type: "backend",
    init: function(services, backendOptions, i18nextOptions) {
        /* use services and options */
        console.log(arguments);
    },

    read: function(language, namespace, callback) {
        console.log(arguments);
        /* return resources */
        callback(null, resources.en.translation[namespace]);
    },
    // optional
    readMulti: function(languages, namespaces, callback) {
        console.log(arguments);
        /* return multiple resources - usefull eg. for bundling loading in one xhr request */
        callback(null, {
            en: {
                translations: resources.en.translation.publisherPage
            }
        });
    },
    // only used in backends acting as cache layer
    save: function(language, namespace, data) {
        // store the translations
    },
    create: function(languages, namespace, key, fallbackValue) {
        /* save the missing translation */
    }
};

i18n.use(reactI18nextModule) // passes i18n down to react-i18next
    .use(backend)
    .init({
        lng: "en",
        interpolation: {
            escapeValue: false // react already safes from xss
        }
    });

export default i18n;
