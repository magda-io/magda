import React from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import Header from "../Components/Header/Header";
import SearchBoxSwitcher from "../Components/SearchBox/SearchBoxSwitcher";
import { config } from "../config.js";
import "./HomePage.css";

import TagLine from "./HomePageComponents/TagLine";
import Lozenge from "./HomePageComponents/Lozenge";
import Stories from "./HomePageComponents/Stories";
import { Small, Medium } from "../UI/Responsive";

import MediaQuery from "react-responsive";

const getBgImg = backgroundImageUrls => {
    let imageMap = {};

    backgroundImageUrls.forEach(item => {
        let width;
        try {
            width = parseInt(
                item.substr(item.lastIndexOf("/") + 1).replace(/[^\d]/g, ""),
                10
            );
            if (isNaN(width)) width = 0;
        } catch (e) {
            width = 0;
        }

        imageMap = Object.assign(imageMap, { [width]: item });
    });

    const screenSizes = Object.keys(imageMap);

    function getBackgroundImage(imageUrl) {
        return {
            backgroundImage: "url(" + imageUrl + ")",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover"
        };
    }
    return (
        <div>
            {screenSizes.map((size, i) => (
                <MediaQuery
                    key={size}
                    minWidth={size + "px"}
                    maxWidth={
                        i === screenSizes.length - 1
                            ? null
                            : screenSizes[i + 1] + "px"
                    }
                >
                    <div
                        className="homepage-background-img"
                        style={getBackgroundImage(imageMap[size])}
                    />
                </MediaQuery>
            ))}
        </div>
    );
};

class HomePage extends React.Component {
    render() {
        return (
            <div className="homepage-app-container">
                {getBgImg(this.props.backgroundImageUrls)}
                <Header />
                <Small>
                    <div className="homepage-background" />
                </Small>
                <div className="container app-container" id="content">
                    {this.props.mobileTagLine && (
                        <Small>
                            <TagLine taglineText={this.props.mobileTagLine} />
                        </Small>
                    )}
                    <SearchBoxSwitcher
                        location={this.props.location}
                        theme="home"
                    />
                    {this.props.desktopTagLine && (
                        <Medium>
                            <TagLine taglineText={this.props.desktopTagLine} />
                            <Lozenge content={this.props.lozenge} />
                        </Medium>
                    )}
                    {this.props.stories &&
                        this.props.stories.length && (
                            <Stories stories={this.props.stories} />
                        )}
                </div>
            </div>
        );
    }
}

function mapStateToProps(state) {
    let desktopTagLine = "";
    let mobileTagLine = "";
    let highlights = {};
    let stories = {};
    if (state.content.isFetched) {
        for (const item of state.content.content) {
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
            }
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
        isTopBannerShown: state.topBanner.isShown,
        desktopTagLine,
        mobileTagLine,
        lozenge: highlights[highlight].lozenge,
        backgroundImageUrls: highlights[highlight].backgroundImageUrls,
        stories
    };
}

export default connect(
    mapStateToProps,
    null
)(withRouter(HomePage));
