// @flow

import datasetSearch from "./datasetSearchReducer";
import facetOrganisationSearch from "./facetOrganisationSearchReducer";
import facetRegionSearch from "./facetRegionSearchReducer";
import facetFormatSearch from "./facetFormatSearchReducer";
import regionMapping from "./regionMappingReducer";
import record from "./recordReducer";
import organisation from "./organisationReducer";
import project from "./projectReducer";
import userManagement from "./userManagementReducer";
import featuredDatasets from "./featuredDatasetsReducer";
import featuredOrganisations from "./featuredOrganisationsReducer";
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
    facetOrganisationSearch,
    facetRegionSearch,
    facetFormatSearch,
    record,
    organisation,
    project,
    userManagement,
    featuredDatasets,
    featuredOrganisations,
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
