import React from "react";
import { contents } from "../content/register";
import { config } from "../config";
import Breadcrumbs from "../UI/Breadcrumbs";
import { Medium } from "../UI/Responsive";
import ReactDocumentTitle from "react-document-title";
import { Redirect } from "react-router-dom";
import { safeLoadFront } from "yaml-front-matter/dist/yamlFront";
import { fetchStaticPage } from "../actions/staticPagesActions";
import "./StaticPage.css";

function StaticPage(props) {
    const id = props.match.params.id;
    const content = contents.get(id);

    const breadcrumb = [
        <li>
            <span>{content.title}</span>
        </li>
    ];
    if (content) {
        return (
            <ReactDocumentTitle
                title={`${content.title ? content.title : id} | ${
                    config.appName
                }`}
            >
                <div className={`static-page-container container page-${id}`}>
                    <Medium>
                        <Breadcrumbs breadcrumbs={breadcrumb} />
                    </Medium>
                    <h1> {content.title && content.title} </h1>
                    <div
                        className="markdown-body"
                        dangerouslySetInnerHTML={{
                            __html: content.__content
                        }}
                    />
                </div>
            </ReactDocumentTitle>
        );
    }
    return <Redirect to={"/404"} />;
}

class StaticPage extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        this.props.fetchHomepageStory(this.props.idx);
    }

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
        const info = this.props.stories[this.props.idx];
        if (info.isFetching) return <div>Loading...</div>;
        if (info.isError) return <div>{info.error.message}</div>;
        if (!info.content) return <div>No content available.</div>;
        const content = safeLoadFront(info.content);
        const innerBody = (
            <div className="story-box-body">
                {content.titleImage
                    ? this.getClickableElement(
                          <img
                              className="story-title-image"
                              src={`${baseUrl}${content.titleImage}`}
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
                    <MarkdownViewer markdown={content.__content} />
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
        const pageName = this.props.match.params.id;
        const pageData = this.props.staticPages[pageName];

        if (
            pageData.isError &&
            pageData.error &&
            pageData.error.statusCode === 404
        ) {
            return (
                <Redirect
                    to={`/error?errorCode=404&recordType=${encodeURI(
                        `${pageName} Page`
                    )}`}
                />
            );
        }

        let title = pageName;
        let bodyContent = "";

        if (info.isFetching) {
            bodyContent = "<p> Loading... </p>";
        } else if (info.isError) {
            bodyContent = `<p> Failed to load page content: ${e.toString()} </p>`;
        } else if (!info.content) {
            bodyContent = `<p> Error: empty page content is returned from server. </p>`;
        } else {
            const content = safeLoadFront(info.content);
            title = content.title ? content.title : title;
            bodyContent = content.__content;
        }

        const breadcrumb = [
            <li>
                <span>{title}</span>
            </li>
        ];
        return (
            <ReactDocumentTitle title={`${title} | ${config.appName}`}>
                <div
                    className={`static-page-container container page-${pageName}`}
                >
                    <Medium>
                        <Breadcrumbs breadcrumbs={breadcrumb} />
                    </Medium>
                    <h1> {title} </h1>
                    <div
                        className="markdown-body"
                        dangerouslySetInnerHTML={{
                            __html: bodyContent
                        }}
                    />
                </div>
            </ReactDocumentTitle>
        );
    }
}

StaticPage.propTypes = {
    // --- optional;
    // --- by default, decide page name by current URL via react-router
    pageName: PropTypes.string
};

function mapStateToProps(state) {
    return {
        staticPages: state.staticPages
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            fetchStaticPage
        },
        dispatch
    );
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(StaticPage);
