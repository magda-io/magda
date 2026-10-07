import React, { FunctionComponent } from "react";
import { Redirect, useHistory, useLocation, useParams } from "react-router-dom";
import Nav from "rsuite/Nav";
import Panel from "rsuite/Panel";
import { MdAutoStories, MdShortText, MdWallpaper } from "react-icons/md";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";
import ContentSettingsLayout from "./ContentSettingsLayout";
import HomeTaglinesTab from "./HomeTaglinesTab";
import HomeHighlightsTab from "./HomeHighlightsTab";
import HomeStoriesTab from "./HomeStoriesTab";
import {
    HOME_SETTINGS_BASE_URL,
    HOME_TAB_HIGHLIGHTS,
    HOME_TAB_STORIES,
    HOME_TAB_TAGLINES,
    isHomeTab
} from "./homeUtils";

const TAB_TITLES = {
    [HOME_TAB_TAGLINES]: "Taglines",
    [HOME_TAB_HIGHLIGHTS]: "Highlights",
    [HOME_TAB_STORIES]: "Stories"
};

const HomeSettingsPage: FunctionComponent = () => {
    const { tab } = useParams<{ tab: string }>();
    const history = useHistory();
    const location = useLocation();

    if (!isHomeTab(tab)) {
        return (
            <Redirect
                to={getUrlWithPopUpQueryString(
                    `${HOME_SETTINGS_BASE_URL}/${HOME_TAB_TAGLINES}`,
                    location
                )}
            />
        );
    }

    return (
        <ContentSettingsLayout
            className="home-settings-page"
            breadcrumbs={[
                {
                    to: `${HOME_SETTINGS_BASE_URL}/${HOME_TAB_TAGLINES}`,
                    title: "Home Page"
                },
                { title: TAB_TITLES[tab] }
            ]}
        >
            <p className="page-intro">
                Manage the content of the home page: the taglines shown above
                the search box, the background images with their highlight
                links, and the stories shown below the search box.
            </p>
            <Nav
                className="content-settings-tab"
                appearance="tabs"
                activeKey={tab}
                onSelect={(key) =>
                    history.push(
                        getUrlWithPopUpQueryString(
                            `${HOME_SETTINGS_BASE_URL}/${key}`,
                            location
                        )
                    )
                }
            >
                <Nav.Item eventKey={HOME_TAB_TAGLINES} icon={<MdShortText />}>
                    {TAB_TITLES[HOME_TAB_TAGLINES]}
                </Nav.Item>
                <Nav.Item eventKey={HOME_TAB_HIGHLIGHTS} icon={<MdWallpaper />}>
                    {TAB_TITLES[HOME_TAB_HIGHLIGHTS]}
                </Nav.Item>
                <Nav.Item eventKey={HOME_TAB_STORIES} icon={<MdAutoStories />}>
                    {TAB_TITLES[HOME_TAB_STORIES]}
                </Nav.Item>
            </Nav>
            <Panel bordered>
                {tab === HOME_TAB_TAGLINES ? (
                    <HomeTaglinesTab />
                ) : tab === HOME_TAB_HIGHLIGHTS ? (
                    <HomeHighlightsTab />
                ) : (
                    <HomeStoriesTab />
                )}
            </Panel>
        </ContentSettingsLayout>
    );
};

export default HomeSettingsPage;
