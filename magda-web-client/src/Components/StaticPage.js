import React, { Component } from "react";
import Breadcrumbs from "../UI/Breadcrumbs";
import { Medium } from "../UI/Responsive";
import MagdaDocumentTitle from "../Components/i18n/MagdaDocumentTitle";
import { safeLoadFront } from "yaml-front-matter/dist/yamlFront";
import { connect } from "react-redux";
import { markdownToHtml } from "../UI/MarkdownViewer";
import "./StaticPage.css";

import { fetchStaticPage } from "../actions/staticPagesActions";
import { bindActionCreators } from "redux";
import * as URI from "urijs";

class StaticPage extends Component {
    constructor(props) {
        super(props);
        this.historyListener = props.history.listen(location => {
            this.loadPageContent(location);
        });
    }

    loadPageContent(location) {
        /**
         * this.props.match.params.pageId not always available or up to date
         * We use `location` instead
         */
        const uri = new URI(location.pathname);
        const pathItems = uri.segmentCoded();
        if (pathItems.length < 2) {
            return;
        }
        // --- remove first segment 'page'
        const firstSegment = pathItems.shift();
        if (firstSegment !== "page") {
            console.error(location);
            return;
        }
        const pageId = pathItems.join("/");
        this.props.fetchStaticPage(pageId);
    }

    componentDidMount() {
        this.loadPageContent(this.props.location);
        // this.updateGAEvent(this.props);
    }

    componentWillUnmount() {
        // --- unregister listener
        if (
            this.historyListener &&
            typeof this.historyListener === "function"
        ) {
            this.historyListener();
        }
    }

    render() {
        const title = this.props.page.title;
        const contentRaw = this.props.page.content;

        const content = safeLoadFront(contentRaw);
        const bodyContent = content.__content;

        const breadcrumb = [
            <li key={0}>
                <span>{title}</span>
            </li>
        ];
        return (
            <MagdaDocumentTitle prefixes={[title]}>
                <div
                    className={`static-page-container container page-${
                        this.props.path
                    }`}
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

function mapStateToProps(state, old) {
    const path = old.match.params.pageId;
    return {
        strings: state.content.strings,
        path,
        page: state.staticPages[path] || {
            title: "Loading...",
            content: "Loading..."
        }
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
