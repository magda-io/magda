import datasetSearch from "./datasetSearchReducer";
import facetPublisherSearch from "./facetPublisherSearchReducer";
import facetRegionSearch from "./facetRegionSearchReducer";
import facetFormatSearch from "./facetFormatSearchReducer";
import regionMapping from "./regionMappingReducer";
import record from "./recordReducer";
import publisher from "./publisherReducer";
import userManagement from "./userManagementReducer";
import featuredDatasets from "./featuredDatasetsReducer";
import featuredPublishers from "./featuredPublishersReducer";
import news from "./newsReducer";
import content from "./contentReducer";
import stats from "./statsReducer";
import topNotification from "./topNotificationReducer";
import homepageStories from "./homePageStoriesReducer";
import staticPagesReducer from "./staticPagesReducer";
import topBanner from "./topBannerReducer";
import previewData from "./previewDataReducer";
import sqlConsoleReducer from "./sqlConsoleReducer";

import { combineReducers } from "redux";

const reducer = combineReducers({
    regionMapping,
    datasetSearch,
    facetPublisherSearch,
    facetRegionSearch,
    facetFormatSearch,
    record,
    publisher,
    userManagement,
    featuredDatasets,
    featuredPublishers,
    news,
    content,
    stats,
    previewData,
    topNotification,
    staticPages: staticPagesReducer,
    homepageStories,
    topBanner,
    sqlConsole: sqlConsoleReducer
});

export type StateType = {
    regionMapping: ReturnType<typeof regionMapping>;
    datasetSearch: ReturnType<typeof datasetSearch>;
    facetPublisherSearch: ReturnType<typeof facetPublisherSearch>;
    facetRegionSearch: ReturnType<typeof facetRegionSearch>;
    facetFormatSearch: ReturnType<typeof facetFormatSearch>;
    record: ReturnType<typeof record>;
    publisher: ReturnType<typeof publisher>;
    userManagement: ReturnType<typeof userManagement>;
    featuredDatasets: ReturnType<typeof featuredDatasets>;
    featuredPublishers: ReturnType<typeof featuredPublishers>;
    news: ReturnType<typeof news>;
    content: ReturnType<typeof content>;
    stats: ReturnType<typeof stats>;
    previewData: ReturnType<typeof previewData>;
    topNotification: ReturnType<typeof topNotification>;
    staticPages: ReturnType<typeof staticPagesReducer>;
    homepageStories: ReturnType<typeof homepageStories>;
    topBanner: ReturnType<typeof topBanner>;
    sqlConsole: ReturnType<typeof sqlConsoleReducer>;
};

export default reducer;
