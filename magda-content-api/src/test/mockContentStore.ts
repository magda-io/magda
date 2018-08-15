import { Content } from "../model";

const mockContentData = [
    {
        id: "text-1",
        type: "plain/text",
        content: "ass"
    },
    {
        id: "text-2",
        type: "plain/html",
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
    }
];

let runtimeContentDataStore: Content[];

const mockContentDataStore = {
    reset: function() {
        runtimeContentDataStore = mockContentData.map(item => ({ ...item }));
    },

    getData: function() {
        return runtimeContentDataStore;
    },

    getContentById(id: string) {
        return runtimeContentDataStore.filter(record => {
            return record.id === id;
        });
    },

    countRecord: function() {
        return runtimeContentDataStore.length;
    }
};

mockContentDataStore.reset();

export default mockContentDataStore;
