// @flow
import type { FetchError } from "../types";
import { config, defaultStrings, defaultConfiguration } from "../config.js";

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
        case "REQUEST_CONTENT_RESET":
            return Object.assign(
                {},
                state,
                {
                    isFetching: false,
                    isFetched: false,
                    error: null
                },
                parseContent([])
            );
        default:
            return state;
    }
};
export default contentReducer;

function parseContent(content) {
    const order = (a, b) => a.order - b.order;

    let desktopTagLine = "";
    let mobileTagLine = "";
    let highlights = {};
    let stories = {};
    const lang = "en";
    let strings = Object.assign({}, defaultStrings);
    let configuration = Object.assign({}, defaultConfiguration);
    let headerNavigation = [];
    let footerMediumNavs = {};
    let footerSmallNavs = {};
    let footerCopyRightItems = [];

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
        } else if (item.id.indexOf("header/navigation/") === 0) {
            headerNavigation.push(item.content);
        } else if (item.id.indexOf("config/") === 0) {
            const id = item.id.substr("config/".length);
            configuration[id] = item.content;
        } else if (
            item.id.indexOf("footer/navigation/medium/category/") === 0
        ) {
            const id = item.id.substr(
                "footer/navigation/medium/category/".length
            );
            footerMediumNavs[id] = footerMediumNavs[id] || {};
            footerMediumNavs[id].content = item.content;
        } else if (
            item.id.indexOf("footer/navigation/medium/category-links/") === 0
        ) {
            const combinedId = item.id.substr(
                "footer/navigation/medium/category-links/".length
            );
            const id = combinedId.substr(0, combinedId.indexOf("/"));
            footerMediumNavs[id] = footerMediumNavs[id] || {};
            footerMediumNavs[id].links = footerMediumNavs[id].links || [];
            footerMediumNavs[id].links.push(item.content);
        } else if (item.id.indexOf("footer/navigation/small/category/") === 0) {
            const id = item.id.substr(
                "footer/navigation/small/category/".length
            );
            footerSmallNavs[id] = footerSmallNavs[id] || {};
            footerSmallNavs[id].content = item.content;
        } else if (
            item.id.indexOf("footer/navigation/small/category-links/") === 0
        ) {
            const combinedId = item.id.substr(
                "footer/navigation/small/category-links/".length
            );
            const id = combinedId.substr(0, combinedId.indexOf("/"));
            footerSmallNavs[id] = footerSmallNavs[id] || {};
            footerSmallNavs[id].links = footerSmallNavs[id].links || [];
            footerSmallNavs[id].links.push(item.content);
        } else if (item.id.indexOf("footer/copyright/") === 0) {
            footerCopyRightItems.push(item.content);
        }
    }

    footerSmallNavs = Object.entries(footerSmallNavs)
        .filter(item => item[1].content && item[1].links)
        .map(item => {
            return {
                ...item[1].content,
                links: item[1].links.sort(order)
            };
        });
    footerMediumNavs = Object.entries(footerMediumNavs)
        .filter(item => item[1].content && item[1].links)
        .map(item => {
            return {
                ...item[1].content,
                links: item[1].links.sort(order)
            };
        });

    let highlight = Object.keys(highlights).filter(
        index => highlights[index].backgroundImageUrls
    );

    if (highlight.length === 0) {
        highlights.default = {
            backgroundImageUrls: [
                "/assets/homepage/0w.jpg",
                "/assets/homepage/720w.jpg",
                "/assets/homepage/1080w.jpg",
                "/assets/homepage/1440w.jpg",
                "/assets/homepage/2160w.jpg"
            ]
        };
        highlight.push("default");
    }

    highlight = highlight[new Date().getDate() % highlight.length];

    stories = Object.values(stories)
        .filter(story => story.content)
        .sort((a, b) => a.content.order - b.content.order);

    if (headerNavigation.length === 0) {
        headerNavigation.push({
            auth: {}
        });
    }
    headerNavigation = headerNavigation.sort(order);

    footerCopyRightItems = footerCopyRightItems.sort(order);

    return {
        desktopTagLine,
        mobileTagLine,
        lozenge: highlights[highlight].lozenge,
        backgroundImageUrls: highlights[highlight].backgroundImageUrls,
        stories,
        strings,
        headerNavigation,
        footerSmallNavs,
        footerMediumNavs,
        footerCopyRightItems,
        configuration
    };
}
