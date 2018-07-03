// @flow

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
import stats from "./statsReducer";
import discussions from "./discussionReducer";
import feedback from "./feedbackReducer";
import topNotification from "./topNotificationReducer";
import homepageStories from "./homePageStoriesReducer";
import topBanner from "./topBannerReducer";

import previewData from "./previewDataReducer";

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
    stats,
    discussions,
    previewData,
    feedback,
    topNotification,
    homepageStories,
    topBanner
});

export default reducer;
