import React, { ComponentType } from "react";
import { connect } from "react-redux";
import { memoize } from "lodash";

import Header from "Components/Header/Header";
import SearchBoxSwitcher from "Components/Dataset/Search/SearchBoxSwitcher";

import "./withHeader.scss";

type Props = {
    finishedFetching: boolean;
    location: string;
};

const withHeader = <P extends {}>(
    WrappedComponent: ComponentType<P>,
    includeSearchBox: boolean
) => {
    const NewComponent = (props: P & Props) => {
        return (
            <div className="other-page">
                <Header />

                {includeSearchBox && (
                    <SearchBoxSwitcher
                        location={props.location}
                        theme="none-home"
                    />
                )}

                <div
                    className={`container app-container ${
                        props.finishedFetching ? "loaded" : "loading"
                    }`}
                    id="content"
                >
                    <WrappedComponent {...props} />
                </div>
            </div>
        );
    };

    const mapStateToProps = state => {
        const datasetIsFetching = state.record.datasetIsFetching;
        const distributionIsFetching = state.record.distributionIsFetching;
        const publishersAreFetching = state.publisher.isFetchingPublishers;
        const datasetSearchIsFetching = state.datasetSearch.isFetching;
        const publisherIsFetching = state.publisher.isFetchingPublisher;

        return {
            finishedFetching:
                !datasetIsFetching &&
                !publishersAreFetching &&
                !datasetSearchIsFetching &&
                !distributionIsFetching &&
                !publisherIsFetching
        };
    };

    return connect(mapStateToProps)(NewComponent);
};

export default memoize(withHeader);
