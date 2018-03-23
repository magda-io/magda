import React, { Component } from "react";
import StoryBox from "./StoryBox";
import { Medium, Small } from "../../UI/Responsive";
import "./Stories.css";
import downArrow from "../../assets/downArrow-homepage-more-stories.svg";

class Stories extends Component {
    constructor(props) {
        super(props);
        this.state = {
            shouldShowStories: false
        };
    }

    render() {
        return (
            <div className="homepage-stories">
                <Small>
                    {this.state.shouldShowStories ? (
                        <div className="mui-row">
                            <div className="mui-col-md-12">
                                <StoryBox idx={0} className="story-box-1" />
                                <StoryBox idx={1} className="story-box-2" />
                                <StoryBox idx={2} className="story-box-3" />
                                <StoryBox idx={3} className="story-box-4" />
                                <StoryBox idx={4} className="story-box-5" />
                                <StoryBox idx={5} className="story-box-6" />
                            </div>
                        </div>
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
                    <table className="table-container">
                        <tbody>
                            <tr>
                                <td className="row-1-col-left">
                                    <StoryBox idx={0} className="story-box-1" />
                                </td>
                                <td className="row-1-col-middle">
                                    <StoryBox idx={1} className="story-box-2" />
                                    <StoryBox idx={2} className="story-box-3" />
                                </td>
                                <td className="row-1-col-right">
                                    <StoryBox idx={3} className="story-box-4" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <table className="table-container">
                        <tbody>
                            <tr>
                                <td className="row-2-col-left">
                                    <StoryBox idx={4} className="story-box-5" />
                                </td>
                                <td className="row-2-col-right">
                                    <StoryBox idx={5} className="story-box-6" />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </Medium>
            </div>
        );
    }
}

export default Stories;
