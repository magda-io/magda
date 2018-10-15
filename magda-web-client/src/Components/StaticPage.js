import React, { Component } from "react";
import PropTypes from "prop-types";
import { contents } from "../content/register";
import { config } from "../config";
import Breadcrumbs from "../UI/Breadcrumbs";
import { Medium } from "../UI/Responsive";
import ReactDocumentTitle from "react-document-title";
import { Redirect } from "react-router-dom";
import { safeLoadFront } from "yaml-front-matter/dist/yamlFront";
import { fetchStaticPage } from "../actions/staticPagesActions";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import "./StaticPage.css";

class StaticPage extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    componentDidMount() {
        const pageName = this.props.match.params.id;
        this.props.fetchHomepageStory(pageName);
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
