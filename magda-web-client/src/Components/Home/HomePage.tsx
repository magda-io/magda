import React from "react";
import { connect } from "react-redux";
import { withRouter, RouteComponentProps } from "react-router-dom";
import Header from "../Header/Header";
import SearchBoxSwitcher from "Components/Dataset/Search/SearchBoxSwitcher";
import "./HomePage.scss";

import TagLine from "Components/Home/TagLine";
import Lozenge, {
    PropsType as LozengePropsType
} from "Components/Home/Lozenge";
import Stories from "Components/Home/Stories";
import { StoryDataType } from "./StoryBox";
import { Small, Medium } from "Components/Common/Responsive";
import { Location } from "history";
import MediaQuery from "react-responsive";
import { User } from "reducers/userManagementReducer";
import { getPluginHeader, HeaderNavItem } from "externalPluginComponents";

const HeaderPlugin = getPluginHeader();

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

    // function getBackgroundImage(imageUrl) {
    //     return {
    //         backgroundImage: "url(" + imageUrl + ")",
    //         backgroundPosition: "center",
    //         backgroundRepeat: "no-repeat",
    //         backgroundSize: "cover"
    //     };
    // }
    return (
        <>
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
                    <img
                        alt="background"
                        src={imageMap[size]}
                        className="homepage-background-img"
                    />
                </MediaQuery>
            ))}
        </>
    );
};

type PropsType = {
    backgroundImageUrls: string;
    mobileTagLine: string;
    desktopTagLine: string;
    lozenge: LozengePropsType;
    stories?: StoryDataType[];
    location: Location;
    headerNavItems: HeaderNavItem[];
    isFetchingWhoAmI: boolean;
    whoAmIError: Error | null;
    user: User;
};

class HomePage extends React.Component<PropsType & RouteComponentProps> {
    getMainContent() {
        if (this?.props?.isFetchingWhoAmI === true) {
            return null;
        } else if (this?.props?.user?.id) {
            return (
                <>
                    <Medium>My dataset section</Medium>
                    <Small>
                        {this?.props?.stories?.length ? (
                            <Stories stories={this.props.stories} />
                        ) : null}
                    </Small>
                </>
            );
        } else if (this?.props?.stories?.length) {
            return <Stories stories={this.props.stories} />;
        } else {
            return null;
        }
    }

    getStories() {
        if (
            this?.props?.isFetchingWhoAmI === true ||
            !this?.props?.stories?.length
        ) {
            return null;
        }
        return <Stories stories={this.props.stories} />;
    }

    render() {
        return (
            <div className="homepage-app-container">
                {getBgImg(this.props.backgroundImageUrls)}
                {HeaderPlugin ? (
                    <HeaderPlugin headerNavItems={this.props.headerNavItems} />
                ) : (
                    <Header />
                )}
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
                            <Lozenge
                                url={this.props?.lozenge?.url}
                                text={this.props?.lozenge?.text}
                            />
                        </Medium>
                    )}
                    {this.getStories()}
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
        stories,
        headerNavItems: headerNavigation
    } = state.content;

    const { isFetchingWhoAmI, user, whoAmIError } = state.userManagement;

    return {
        isTopBannerShown: state.topBanner.isShown,
        desktopTagLine,
        mobileTagLine,
        lozenge,
        backgroundImageUrls,
        stories,
        headerNavigation,
        isFetchingWhoAmI,
        whoAmIError,
        user
    };
}

export default connect(mapStateToProps, null)(withRouter(HomePage));
