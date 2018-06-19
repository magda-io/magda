import React, { Component } from "react";
import { connect } from "react-redux";
import { config } from "../../config";
import { bindActionCreators } from "redux";
import { fetchPublishersIfNeeded } from "../../actions/publisherActions";
import ReactDocumentTitle from "react-document-title";
import PublisherSummary from "./PublisherSummary";
import ErrorHandler from "../../Components/ErrorHandler";
import getPageNumber from "../../helpers/getPageNumber";
import ProgressBar from "../../UI/ProgressBar";
import queryString from "query-string";
import PropTypes from "prop-types";
import debounce from "lodash.debounce";
import "./PublishersViewer.css";
import search from "../../assets/search-dark.svg";

class PublishersViewer extends Component {
    constructor(props) {
        super(props);
        this.state = {
            searchText: "*"
        };
        this.onUpdateSearchText = this.onUpdateSearchText.bind(this);
        this.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(
            this
        );
    }
    debounceUpdateSearchQuery = debounce(this.updateSearchQuery, 3000);
    onPageChange(i) {
        this.context.router.history.push({
            pathname: this.props.location.pathname,
            search: queryString.stringify(
                Object.assign(queryString.parse(this.props.location.search), {
                    page: i
                })
            )
        });
    }

    componentDidMount() {
        this.props.fetchPublishersIfNeeded(
            getPageNumber(this.props) || 1,
            this.state.searchText
        );
    }

    updateQuery(query) {
        // this.context.router.history.push({
        //     pathname: "/organisations/search",
        //     search: queryString.stringify(
        //         Object.assign(
        //             queryString.parse(this.props.location.search),
        //             query
        //         )
        //     )
        // });
    }

    handleSearchFieldEnterKeyPress(event) {
        // when user hit enter, no need to submit the form
        if (event.charCode === 13) {
            event.preventDefault();
            this.debounceUpdateSearchQuery.flush(this.state.searchText);
        }
    }

    updateSearchQuery(text) {
        if (text === "") text = "*";
        this.updateQuery({
            q: text,
            page: undefined
        });
        this.props.fetchPublishersIfNeeded(
            getPageNumber(this.props) || 1,
            text
        );
    }

    onUpdateSearchText(e) {
        this.setState({
            searchText: e.target.value
        });
        this.debounceUpdateSearchQuery(e.target.value);
    }

    renderContent() {
        if (this.props.error) {
            return <ErrorHandler error={this.props.error} />;
        } else {
            if (this.props.publishers.length === 0) {
                return <div> no results</div>;
            }
            return (
                <div>
                    {this.props.publishers.map(p => (
                        <PublisherSummary publisher={p} key={p.identifier} />
                    ))}
                </div>
            );
        }
    }

    renderSearchBar() {
        return (
            <div className="organization-search">
                <label htmlFor="organization-search" className="sr-only">
                    Search for organisations
                </label>
                <input
                    className="au-text-input au-text-input--block organization-search"
                    name="organization-search"
                    id="organization-search"
                    type="text"
                    value={this.searchText}
                    placeholder="Search for organisations"
                    onChange={this.onUpdateSearchText}
                    onKeyPress={this.handleSearchFieldEnterKeyPress}
                />
                <img className="search-icon" src={search} alt="search" />
            </div>
        );
    }

    render() {
        return (
            <ReactDocumentTitle title={"Organisations | " + config.appName}>
                <div className="publishers-viewer">
                    <h1>Organisations</h1>
                    <div className="row">
                        <div className="col-sm-8">
                            {!this.props.isFetching && this.renderContent()}
                        </div>
                        {this.props.isFetching && <ProgressBar />}
                        <div className="col-sm-4">{this.renderSearchBar()}</div>
                    </div>
                </div>
            </ReactDocumentTitle>
        );
    }
}

function mapDispatchToProps(dispatch: Function) {
    return bindActionCreators(
        {
            fetchPublishersIfNeeded: fetchPublishersIfNeeded
        },
        dispatch
    );
}

function mapStateToProps(state, ownProps) {
    const publishers: Array<Object> = state.publisher.publishers;
    const isFetching: boolean = state.publisher.isFetchingPublishers;
    const hitCount: number = state.publisher.hitCount;
    const error: Object = state.publisher.errorFetchingPublishers;
    const location: Location = ownProps.location;
    return {
        publishers,
        isFetching,
        hitCount,
        location,
        error
    };
}

PublishersViewer.contextTypes = {
    router: PropTypes.object.isRequired
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(PublishersViewer);
