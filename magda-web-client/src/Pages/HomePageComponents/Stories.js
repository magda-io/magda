import React from "react";
import StoryBox from "./StoryBox";

const Stories = () => {
    return (
        <div className="homepage-stories">
            <div className="mui-row">
                <div className="mui-col-md-4">
                    <StoryBox idx={0} className="story-box-1"/>
                </div>
                <div className="mui-col-md-4">
                    <StoryBox idx={1} className="story-box-2" />
                    <StoryBox idx={2} className="story-box-3" />
                </div>
                <div className="mui-col-md-4">
                    <StoryBox idx={3} className="story-box-4" />
                </div>
            </div>
            <div className="mui-row">
                <div className="mui-col-md-6">
                    <StoryBox idx={4} className="story-box-5" />
                </div>
                <div className="mui-col-md-6">
                    <StoryBox idx={5} className="story-box-6" />
                </div>
            </div>
        </div>
    );
};

export default Stories;
