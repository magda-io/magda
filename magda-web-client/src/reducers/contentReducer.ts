import { config, defaultConfiguration } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import { FetchError } from "../types";

const initialData: ContentState = Object.assign(
    {
        content: [],
        isFetching: false,
        isFetched: false
    },
    parseContent([])
);

type ContentState = {
    isFetching: boolean;
    isFetched: boolean;
    error?: number;
    content: Array<any>;
};

type ContentAction = {
    type: string;
    content?: Array<any>;
    error: FetchError;
};

const contentReducer = (
    state: ContentState = initialData,
    action: ContentAction
) => {
    switch (action.type) {
        case actionTypes.REQUEST_CONTENT:
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
        case actionTypes.REQUEST_CONTENT_ERROR:
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
        case actionTypes.RECEIVE_CONTENT:
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
    const order = (a, b) => a.order - b.order;

    let desktopTagLine = "";
    let mobileTagLine = "";
    let highlights: any = {};
    let stories: any = {};
    let configuration: any = Object.assign({}, defaultConfiguration);
    let headerNavigation: any[] = [];
    let footerMediumNavs: any = {};
    let footerSmallNavs: any = {};
    let footerCopyRightItems: any[] = [];

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
        .filter((item: any) => item[1].content && item[1].links)
        .map((item: any) => {
            return {
                ...item[1].content,
                links: item[1].links.sort(order)
            };
        });
    footerMediumNavs = Object.entries(footerMediumNavs)
        .filter((item: any) => item[1].content && item[1].links)
        .map((item: any) => {
            return {
                ...item[1].content,
                links: item[1].links.sort(order)
            };
        });

    let filteredHighlights: string[] = Object.keys(highlights).filter(
        (index) => highlights[index].backgroundImageUrls
    );

    if (filteredHighlights.length === 0) {
        highlights.default = {
            backgroundImageUrls: [
                "assets/homepage/0w.jpg",
                "assets/homepage/720w.jpg",
                "assets/homepage/1080w.jpg",
                "assets/homepage/1440w.jpg",
                "assets/homepage/2160w.jpg"
            ]
        };
        filteredHighlights.push("default");
    }

    const finalHighlight =
        filteredHighlights[new Date().getDate() % filteredHighlights.length];

    stories = Object.values(stories)
        .filter((story: any) => story.content)
        .sort((a: any, b: any) => a.content.order - b.content.order);

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
        lozenge: highlights[finalHighlight].lozenge,
        backgroundImageUrls: highlights[finalHighlight].backgroundImageUrls,
        stories,
        headerNavigation,
        footerSmallNavs,
        footerMediumNavs,
        footerCopyRightItems,
        configuration
    };
}
