import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { fetchHomepageStory } from "../../actions/homePageStoriesActions";
import {safeLoadFront} from "yaml-front-matter";
import MarkdownViewer from "../../UI/MarkdownViewer";
import { config } from "../../config";
import "./StoryBox.css";

const baseUrl = config.homePageConfig.baseUrl ? config.homePageConfig.baseUrl : "";

class StoryBox extends Component {
    constructor(props) {
        super(props);
        this.state = {
            
        };
    }

    componentDidMount(){
        this.props.fetchHomepageStory(this.props.idx);
    }

    renderStoryboxBody()
    {
        const info = this.props.stories[this.props.idx];
        if(info.isFetching) return <div>Loading...</div>;
        if(info.isError) return <div>{info.error.message}</div>
        if(!info.content) return <div>No content available.</div>;
        const content = safeLoadFront(info.content);
        if(content.titleImage) {

        }
        return (<div story-box-body>
            {content.titleImage?(
                <img className="story-title-image" src={`${baseUrl}${content.titleImage}`} alt="title" />
            ):null}
            {content.title?(
                <h1 className="story-title">{content.title}</h1>
            ):null}
            <MarkdownViewer markdown={content.__content}/>
        </div>);
    }

    render() {
        
        return (
            <div className="story-box">{this.renderStoryboxBody()}</div>
        );
    }
}

StoryBox.propTypes = {
    idx: PropTypes.number.isRequired
};

function mapStateToProps(state) {
    return {
        stories : state.homepageStories
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            fetchHomepageStory: fetchHomepageStory
        },
        dispatch
    );
};

export default connect(mapStateToProps, mapDispatchToProps)(
    StoryBox
);