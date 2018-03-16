
import React from "react";
import StoryBox from "./StoryBox";

const Stories = ()=>{
    return <div className="mui-row homepage-stories">
        <div className="mui-col-md-12">
            <StoryBox idx={0} />
        </div>
    </div>;
};

export default Stories;