import React, { Component } from "react";
import MarkdownViewer from "../../UI/MarkdownViewer";
import "./StoryBox.css";

class StoryBox extends Component {
    getClickableElement(el, url) {
        if (!url) return el;
        return (
            <a
                target="_blank"
                rel="noopener noreferrer"
                href={url}
                className="story-title-link"
            >
                {el}
            </a>
        );
    }

    renderStoryboxBody() {
        const { story } = this.props;
        if (!story) return null;
        const { content, image } = story;
        if (!content) return null;
        const innerBody = (
            <div className="story-box-body">
                {image
                    ? this.getClickableElement(
                          <img
                              className="story-title-image"
                              src={`${image}`}
                              alt="title"
                          />,
                          content.titleUrl
                      )
                    : null}
                <div className="story-box-text">
                    {content.title
                        ? this.getClickableElement(
                              <h2 className="story-title">{content.title}</h2>,
                              content.titleUrl
                          )
                        : null}
                    <MarkdownViewer markdown={content.content} />
                </div>
            </div>
        );
        return innerBody;
    }

    getStoryBoxClassName() {
        const classNames = ["story-box"];
        if (this.props.className && typeof this.props.className === "string")
            classNames.push(this.props.className);
        return classNames.join(" ");
    }

    render() {
        return (
            <div className={this.getStoryBoxClassName()}>
                {this.renderStoryboxBody()}
            </div>
        );
    }
}

export default StoryBox;
