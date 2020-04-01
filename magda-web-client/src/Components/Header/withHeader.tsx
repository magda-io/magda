import React, { ComponentType } from "react";
import { connect } from "react-redux";
import { memoize } from "lodash";
import { Location } from "history";
import Header from "Components/Header/Header";
import SearchBoxSwitcher from "Components/Dataset/Search/SearchBoxSwitcher";
import AddDatasetProgressMeter, {
    ExternalProps as AddDatasetProgressMeterProps
} from "Components/Common/AddDatasetProgressMeter";

import "./withHeader.scss";

type Props = {
    finishedFetching: boolean;
    location: Location;
};

type InterfaceOptions = {
    includeSearchBox?: boolean;
    includeDatasetPageProgressMeter?: boolean;
    noContainerClass?: boolean;
};

const withHeader = <P extends {}>(
    WrappedComponent: ComponentType<P & Props>,
    {
        includeSearchBox,
        includeDatasetPageProgressMeter,
        noContainerClass
    }: InterfaceOptions = {},
    addDatasetProgressMeterProps: AddDatasetProgressMeterProps = {}
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

                {includeDatasetPageProgressMeter && (
                    <AddDatasetProgressMeter
                        {...addDatasetProgressMeterProps}
                    />
                )}

                <div
                    className={`${
                        noContainerClass ? "" : "container"
                    } app-container ${
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
