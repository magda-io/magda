import React, { Component } from "react";
import StoryBox, { StoryDataType } from "./StoryBox";
import { Medium, Small } from "Components/Common/Responsive";
import "./Stories.scss";
import downArrow from "assets/downArrow-homepage-more-stories.svg";
import { CSSTransition, TransitionGroup } from "react-transition-group";

export type PropsType = {
    stories?: StoryDataType[];
};

type StateType = {
    shouldShowStories: boolean;
};

class Stories extends Component<PropsType, StateType> {
    constructor(props) {
        super(props);
        this.state = {
            shouldShowStories: false
        };
        this.showStories = this.showStories.bind(this);
    }

    componentDidMount() {
        window.addEventListener("scroll", this.showStories);
        // we made all stories are shown on initial page load to avoid a long background image cut off issue.
        this.showStories();
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
        const { stories } = this.props;
        if (!stories || !stories.length) {
            return null;
        }
        const rows: StoryDataType[][] = [];
        for (let x = 0; x < stories.length; x += 2) {
            rows.push(stories.slice(x, x + 2));
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
                                        {stories.map((story, index) => (
                                            <StoryBox
                                                idx={index}
                                                story={story}
                                                className={`story-box-${index} small-screen-layout`}
                                                key={index}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </CSSTransition>
                        </TransitionGroup>
                    ) : (
                        <div className="homepage-stories-show-stories-button-container">
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
                        </div>
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
                                {rows.map((row, r) => {
                                    return (
                                        <div
                                            className="stories-container"
                                            key={r}
                                        >
                                            {row.map((story, i) => (
                                                <div
                                                    className={`col-2`}
                                                    key={i}
                                                >
                                                    <StoryBox
                                                        idx={r * 2 + i}
                                                        story={story}
                                                        className={`stories medium-screen-layout story-box-${
                                                            r * 4 + i
                                                        }`}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </CSSTransition>
                    </TransitionGroup>
                </Medium>
            </div>
        );
    }
}

export default Stories;
