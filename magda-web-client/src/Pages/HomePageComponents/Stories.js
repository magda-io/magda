import React, { Component } from "react";
import StoryBox from "./StoryBox";
import { Medium, Small } from "../../UI/Responsive";
import "./Stories.css";
import downArrow from "../../assets/downArrow-homepage-more-stories.svg";
import { CSSTransitionGroup } from "react-transition-group";
import { config } from "../../config";

class Stories extends Component {
    constructor(props) {
        super(props);
        this.state = {
            shouldShowStories: false
        };
    }

    render() {
        if (!config || !config.homePageConfig || !config.homePageConfig.stories || !config.homePageConfig.stories.length) {
            return null;
        }
        return (
            <div className="homepage-stories">
                <Small>
                    {this.state.shouldShowStories ? (
                        <CSSTransitionGroup
                            transitionName="animation"
                            transitionEnter={false}
                            transitionLeave={false}
                            transitionAppear={true}
                            transitionAppearTimeout={500}
                        >
                            <div className="mui-row" key="stories-boxes">
                                <div className="mui-col-md-12">
                                    <StoryBox idx={0} className="story-box-1" />
                                    <StoryBox idx={1} className="story-box-2" />
                                    <StoryBox idx={2} className="story-box-3" />
                                    <StoryBox idx={3} className="story-box-4" />
                                    <StoryBox idx={4} className="story-box-5" />
                                    <StoryBox idx={5} className="story-box-6" />
                                </div>
                            </div>
                        </CSSTransitionGroup>
                    ) : (
                        <button
                            className="homepage-stories-show-stories-button"
                            onClick={() => {
                                this.setState({
                                    shouldShowStories: true
                                });
                            }}
                        >
                            <div>Latest News</div>
                            <img src={downArrow} alt="more-stories-button" />
                        </button>
                    )}
                </Small>
                <Medium>
                    <CSSTransitionGroup
                        transitionName="animation"
                        transitionEnter={false}
                        transitionLeave={false}
                        transitionAppear={true}
                        transitionAppearTimeout={500}
                    >
                        <div className="stories-container">
                            <div className="col-3">
                                <StoryBox idx={0} className="stories" />
                            </div>
                            <div className="col-3">
                                <div className="row-2">
                                    <StoryBox idx={1} className="row stories" />
                                    <StoryBox idx={2} className="row stories" />
                                </div>
                            </div>
                            <div className="col-3">
                                <StoryBox idx={3} className="stories" />
                            </div>
                        </div>
                        <div className="stories-container">
                            <div className="col-2">
                                <StoryBox idx={4} className="stories" />
                            </div>
                            <div className="col-2">
                                <StoryBox idx={5} className="stories" />
                            </div>
                        </div>
                    </CSSTransitionGroup>
                </Medium>
            </div>
        );
    }
}

export default Stories;
