import React from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import Header from "../Header/Header";
import SearchBoxSwitcher from "Components/Dataset/Search/SearchBoxSwitcher";
import "./HomePage.scss";

import TagLine from "Components/Home/TagLine";
import Lozenge from "Components/Home/Lozenge";
import Stories from "Components/Home/Stories";
import { Small, Medium } from "Components/Common/Responsive";

import MediaQuery from "react-responsive";

const getBgImg = (backgroundImageUrls) => {
    let imageMap = {};

    backgroundImageUrls.forEach((item) => {
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
                    {(this.props.stories && this.props.stories.length && (
                        <Stories stories={this.props.stories} />
                    )) ||
                        ""}
                </div>
            </div>
        );
    }
}

function mapStateToProps(state) {
    const {
        desktopTagLine,
        mobileTagLine,
        lozenge,
        backgroundImageUrls,
        stories
    } = state.content;

    return {
        isTopBannerShown: state.topBanner.isShown,
        desktopTagLine,
        mobileTagLine,
        lozenge,
        backgroundImageUrls,
        stories
    };
}

export default connect(mapStateToProps, null)(withRouter(HomePage));
