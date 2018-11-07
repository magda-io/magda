import React, { Component } from "react";
import PropTypes from "prop-types";
import Breadcrumbs from "../UI/Breadcrumbs";
import { Medium } from "../UI/Responsive";
import MagdaDocumentTitle from "../Components/i18n/MagdaDocumentTitle";
import { Redirect } from "react-router-dom";
import { safeLoadFront } from "yaml-front-matter/dist/yamlFront";
import { fetchStaticPage } from "../actions/staticPagesActions";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { markdownToHtml } from "../UI/MarkdownViewer";
import * as URI from "urijs";
import "./StaticPage.css";

export const StaticPageNames = ["about", "privacy-policy", "dataset-quality"];

class StaticPage extends Component {
    constructor(props) {
        super(props);
        props.history.listen(location => {
            this.loadPagaData(location.pathname);
        });
    }

    componentDidMount() {
        this.loadPagaData(this.props.location.pathname);
    }

    loadPagaData(urlPath) {
        const uri = URI(urlPath);
        // --- if url 2nd last url seq is not `page`
        if (uri.segmentCoded(-2) !== "page") return;
        const pageName = uri.segmentCoded(-1);
        this.props.fetchStaticPage(pageName);
    }

    render() {
        const pageName = this.props.match.params.id;
        const pageData = this.props.staticPages[pageName]
            ? this.props.staticPages[pageName]
            : {
                  isFetching: true
              };

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

        if (pageData.isFetching) {
            bodyContent = "<p> Loading... </p>";
        } else if (pageData.isError) {
            bodyContent = `<p> Failed to load page content: ${
                pageData.error ? pageData.error.toString() : "Unkown Error"
            } </p>`;
        } else if (!pageData.content) {
            bodyContent = `<p> Error: empty page content is returned from server. </p>`;
        } else {
            const content = safeLoadFront(pageData.content);
            title = content.title ? content.title : title;
            bodyContent = content.__content;
        }

        const breadcrumb = [
            <li key={0}>
                <span>{title}</span>
            </li>
        ];
        return (
            <MagdaDocumentTitle prefixes={[title]}>
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
                            __html: markdownToHtml(bodyContent)
                        }}
                    />
                </div>
            </MagdaDocumentTitle>
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
        staticPages: state.staticPages,
        strings: state.content.strings
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
