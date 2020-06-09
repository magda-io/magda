import { Content } from "../model";

export const mockContentData = [
    {
        id: "text-1",
        type: "text/plain",
        content: "ass"
    },
    {
        id: "text-2",
        type: "text/html",
        content: ""
    },
    {
        id: "json-1",
        type: "application/json",
        content: "null"
    },
    {
        id: "json-2",
        type: "application/json",
        content: '{ "acdc": "test" }'
    },
    {
        id: "png-id",
        type: "image/png",
        content:
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg=="
    },
    {
        id: "gif-id",
        type: "image/gif",
        content: "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="
    },
    {
        id: "svg-id",
        type: "image/svg+xml",
        content: "PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLz4="
    },
    {
        id: "logo",
        type: "image/gif",
        content: "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="
    },
    {
        id: "js",
        type: "application/javascript",
        content: "var a = 1;"
    }
];

let runtimeContentDataStore: Content[];

const mockContentDataStore = {
    reset: function () {
        runtimeContentDataStore = mockContentData.map((item) => ({ ...item }));
    },

    getData: function () {
        return runtimeContentDataStore;
    },

    getContentById(id: string) {
        return runtimeContentDataStore.filter((record) => {
            return record.id === id;
        });
    },

    setContentById(id: string, type: string, content: string) {
        let set = false;
        runtimeContentDataStore
            .filter((record) => {
                return record.id === id;
            })
            .forEach((record) => {
                set = true;
                record.type = type;
                record.content = content;
            });
        if (!set) {
            runtimeContentDataStore.push({ id, type, content });
        }
    },

    getContentSummary() {
        return runtimeContentDataStore.map((x) => ({ ...x }));
    },

    deleteContentById(id: string) {
        const index = runtimeContentDataStore.findIndex(
            (record: Content) => record.id === id
        );
        if (index !== -1) {
            runtimeContentDataStore.splice(index, 1);
        }
    },

    countRecord: function () {
        return runtimeContentDataStore.length;
    }
};

mockContentDataStore.reset();

export default mockContentDataStore;
