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

const getBgImg = () => {
    let imageMap = {};
    if (!config.homePageConfig || !config.homePageConfig.backgroundImageUrls)
        return null;
    const backgroundImageUrls = config.homePageConfig.backgroundImageUrls;
    if (!backgroundImageUrls.length) return null;
    const baseUrl = config.homePageConfig.baseUrl
        ? config.homePageConfig.baseUrl
        : "";

    backgroundImageUrls.forEach(item => {
        let width;
        try {
            width = parseInt(item.replace(/[^\d]/g, ""), 10);
            if (isNaN(width)) width = 0;
        } catch (e) {
            width = 0;
        }

        imageMap = Object.assign(imageMap, { [width]: baseUrl + item });
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
                {getBgImg()}
                <Header />
                <Small>
                    <div className="homepage-background" />
                </Small>
                <div className="container app-container" id="content">
                    <Small>
                        <TagLine taglineText={this.props.mobileTagLine} />
                    </Small>
                    <SearchBoxSwitcher
                        location={this.props.location}
                        theme="home"
                    />
                    <Medium>
                        <TagLine taglineText={this.props.desktopTagLine} />
                        <Lozenge />
                    </Medium>
                    <Stories />
                </div>
            </div>
        );
    }
}

function mapStateToProps(state) {
    let desktopTagLine = "";
    let mobileTagLine = "";
    if (state.content.isFetched) {
        for (const item of Object.entries(state.content.content)) {
            switch (item.id) {
                case "home/tagline/desktop":
                    desktopTagLine = item.content;
                    break;
                case "home/tagline/mobile":
                    mobileTagLine = item.content;
                    break;
            }
        }
    }
    return {
        isTopBannerShown: state.topBanner.isShown,
        desktopTagLine,
        mobileTagLine
    };
}

export default connect(
    mapStateToProps,
    null
)(withRouter(HomePage));
