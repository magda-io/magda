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
import dgaLogo from "../assets/dga-logo.svg";

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

const getTagLine = () => {
    const homePageConfig = config.homePageConfig;
    return {
        desktop:
            config && homePageConfig.tagLineTextDesktop
                ? homePageConfig.tagLineTextDesktop
                : "",
        mobile:
            config && homePageConfig.tagLineTextMobile
                ? homePageConfig.tagLineTextMobile
                : ""
    };
};

const HomePage = withRouter(({ location, isTopBannerShown }) => {
    return (
        <div className="homepage-app-container">
            {getBgImg()}
            <Header />
            <Small>
                <div className="homepage-background" />
            </Small>
            <div className="container app-container" id="content">
                <Medium>
                    <div className="homepage-dga-logo">
                        <img src={dgaLogo} alt="dga logo" />
                    </div>
                </Medium>
                <Small>
                    <TagLine taglineText={getTagLine().mobile} />
                </Small>
                <SearchBoxSwitcher location={location} theme="home" />
                <Medium>
                    <TagLine taglineText={getTagLine().desktop} />
                    <Lozenge />
                </Medium>
                <Stories />
            </div>
        </div>
    );
});

function mapStateToProps(state) {
    return {
        isTopBannerShown: state.topBanner.isShown
    };
}

export default connect(
    mapStateToProps,
    null
)(HomePage);
