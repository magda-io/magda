// @flow
import type { FetchError } from "../types";
import { config, defaultStrings } from "../config.js";

const initialData = Object.assign(
    {
        content: [],
        isFetching: false,
        isFetched: false,
        error: null
    },
    parseContent([])
);

type contentState = {
    isFetching: boolean,
    isFetched: boolean,
    error: ?number,
    content: Array<Object>
};

type contentAction = {
    type: string,
    content?: Array<Object>,
    error: FetchError
};

const contentReducer = (
    state: contentState = initialData,
    action: contentAction
) => {
    switch (action.type) {
        case "REQUEST_CONTENT":
            return Object.assign(
                {},
                state,
                {
                    isFetching: true,
                    isFetched: false,
                    error: null
                },
                parseContent([])
            );
        case "REQUEST_CONTENT_ERROR":
            return Object.assign(
                {},
                state,
                {
                    isFetching: false,
                    isFetched: true,
                    error: action.error
                },
                parseContent([])
            );
        case "RECEIVE_CONTENT":
            return Object.assign(
                {},
                state,
                {
                    isFetching: false,
                    isFetched: true,
                    content: action.content,
                    error: null
                },
                parseContent(action.content)
            );

        default:
            return state;
    }
};
export default contentReducer;

function parseContent(content) {
    let desktopTagLine = "";
    let mobileTagLine = "";
    let highlights = {};
    let stories = {};
    const lang = "en";
    let strings = Object.assign(defaultStrings);
    let strings = Object.assign({}, defaultStrings);
    for (const item of content) {
        if (item.id === "home/tagline/desktop") {
            desktopTagLine = item.content;
        } else if (item.id === "home/tagline/mobile") {
            mobileTagLine = item.content;
        } else if (item.id.indexOf("home/highlights/") === 0) {
            const id = item.id.substr("home/highlights/".length);
            highlights[id] = highlights[id] || {};
            highlights[id].lozenge = item.content;
        } else if (item.id.indexOf("home/highlight-images/") === 0) {
            let id = item.id.substr("home/highlight-images/".length);
            id = id.substr(0, id.lastIndexOf("/"));
            highlights[id] = highlights[id] || {};
            highlights[id].backgroundImageUrls =
                highlights[id].backgroundImageUrls || [];
            highlights[id].backgroundImageUrls.push(
                `${config.contentApiURL}/${item.id}.bin`
            );
        } else if (item.id.indexOf("home/stories/") === 0) {
            const id = item.id.substr("home/stories/".length);
            stories[id] = stories[id] || { id };
            stories[id].content = item.content;
        } else if (item.id.indexOf("home/story-images/") === 0) {
            const id = item.id.substr("home/story-images/".length);
            stories[id] = stories[id] || { id };
            stories[id].image = `${config.contentApiURL}/${item.id}.bin`;
        } else if (item.id.indexOf(`lang/${lang}/`) === 0) {
            const id = item.id.substr(`lang/${lang}/`.length);
            strings[id] = item.content;
        }
    }
    if (Object.keys(highlights).length === 0) {
        highlights.default = {
            backgroundImageUrls: [
                "/assets/homepage/0w.jpg",
                "/assets/homepage/720w.jpg",
                "/assets/homepage/1080w.jpg",
                "/assets/homepage/1440w.jpg",
                "/assets/homepage/2160w.jpg"
            ]
        };
    }
    let highlight = Object.keys(highlights);
    highlight = highlight[new Date().getDate() % highlight.length];

    stories = Object.values(stories)
        .filter(story => story.content)
        .sort((a, b) => a.content.order - b.content.order);

    return {
        desktopTagLine,
        mobileTagLine,
        lozenge: highlights[highlight].lozenge,
        backgroundImageUrls: highlights[highlight].backgroundImageUrls,
        stories,
        strings
    };
}
