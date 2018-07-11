import React, { Component } from "react";
import StoryBox from "./StoryBox";
import { Medium, Small } from "../../UI/Responsive";
import "./Stories.css";
import downArrow from "../../assets/downArrow-homepage-more-stories.svg";
import { CSSTransition, TransitionGroup } from "react-transition-group";
import { config } from "../../config";

class Stories extends Component {
    constructor(props) {
        super(props);
        this.state = {
            shouldShowStories: false
        };
        this.showStories = this.showStories.bind(this);
    }

    componentDidMount() {
        window.addEventListener("scroll", this.showStories);
    }

    showStories() {
        this.setState({
            shouldShowStories: true
        });
    }

    componentWillUnmount() {
        window.removeEventListener("scroll", this.showStories);
    }

    render() {
        if (
            !config ||
            !config.homePageConfig ||
            !config.homePageConfig.stories ||
            !config.homePageConfig.stories.length
        ) {
            return <div />;
        }
        return (
            <div className="homepage-stories">
                <Small>
                    {this.state.shouldShowStories ? (
                        <TransitionGroup>
                            <CSSTransition
                                classNames="animation"
                                enter={false}
                                exit={false}
                                appear={true}
                                timeout={{ appear: 500 }}
                            >
                                <div className="row" key="stories-boxes">
                                    <div className="col-md-12">
                                        <StoryBox
                                            idx={0}
                                            className="story-box-1"
                                        />
                                        <StoryBox
                                            idx={1}
                                            className="story-box-2"
                                        />
                                        <StoryBox
                                            idx={2}
                                            className="story-box-3"
                                        />
                                        <StoryBox
                                            idx={3}
                                            className="story-box-4"
                                        />
                                        <StoryBox
                                            idx={4}
                                            className="story-box-5"
                                        />
                                        <StoryBox
                                            idx={5}
                                            className="story-box-6"
                                        />
                                    </div>
                                </div>
                            </CSSTransition>
                        </TransitionGroup>
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
                            <img src={downArrow} alt="more-stories" />
                        </button>
                    )}
                </Small>
                <Medium>
                    <TransitionGroup>
                        <CSSTransition
                            classNames="animation"
                            enter={false}
                            exit={false}
                            appear={true}
                            timeout={{ appear: 500 }}
                        >
                            <div>
                                <div className="stories-container">
                                    <div className="col-3">
                                        <StoryBox idx={0} className="stories" />
                                    </div>
                                    <div className="col-3">
                                        <div className="row-2">
                                            <StoryBox
                                                idx={1}
                                                className="row stories"
                                            />
                                            <StoryBox
                                                idx={2}
                                                className="row stories"
                                            />
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
                            </div>
                        </CSSTransition>
                    </TransitionGroup>
                </Medium>
            </div>
        );
    }
}

export default Stories;
