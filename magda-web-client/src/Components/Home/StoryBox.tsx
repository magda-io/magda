import React, { Component } from "react";
import MarkdownViewer from "Components/Common/MarkdownViewer";
import CommonLink from "Components/Common/CommonLink";
import "./StoryBox.scss";

export type StoryDataType = {
    content: {
        title?: string;
        titleUrl: string;
        content: string;
    };
    image: string;
};

type PropsType = {
    idx?: number;
    story?: StoryDataType;
    className?: string;
};

class StoryBox extends Component<PropsType> {
    getClickableElement(el, url, label) {
        if (!url) return el;
        return (
            <CommonLink
                target="_blank"
                rel="noopener noreferrer"
                href={url}
                className="story-title-link"
                aria-label={label}
            >
                {el}
            </CommonLink>
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
                          <div>
                              <img
                                  className="story-title-image"
                                  src={`${image}`}
                                  alt=""
                                  aria-hidden="true"
                              />
                              {content.title ? (
                                  <h2
                                      className="story-title"
                                      aria-hidden="true"
                                  >
                                      {content.title}
                                  </h2>
                              ) : null}
                          </div>,
                          content.titleUrl,
                          content.title || `Link to ${content.titleUrl}`
                      )
                    : null}
                <div className="story-box-text">
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
