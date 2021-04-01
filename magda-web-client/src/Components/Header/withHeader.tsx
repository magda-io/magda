import React, { ComponentType } from "react";
import { connect, ConnectedProps } from "react-redux";
import { memoize } from "lodash";
import { Location } from "history";
import Header from "Components/Header/Header";
import SearchBoxSwitcher from "Components/Dataset/Search/SearchBoxSwitcher";
import AddDatasetProgressMeter, {
    ExternalProps as AddDatasetProgressMeterProps
} from "Components/Common/AddDatasetProgressMeter";
import { getPluginHeader } from "externalPluginComponents";

import "./withHeader.scss";
import { User } from "reducers/userManagementReducer";

type InterfaceOptions = {
    includeSearchBox?: boolean;
    includeDatasetPageProgressMeter?: boolean;
    noContainerClass?: boolean;
};

type PlainObject = {
    [key: string]: any;
};

const HeaderPlugin = getPluginHeader();

const mapStateToProps = (state) => {
    const datasetIsFetching = state.record.datasetIsFetching;
    const distributionIsFetching = state.record.distributionIsFetching;
    const publishersAreFetching = state.publisher.isFetchingPublishers;
    const datasetSearchIsFetching = state.datasetSearch.isFetching;
    const publisherIsFetching = state.publisher.isFetchingPublisher;
    const isFetchingWhoAmI = state.userManagement.isFetchingWhoAmI;
    const user = state.userManagement.user;
    const whoAmIError = state.userManagement.whoAmIError;

    return {
        user,
        whoAmIError,
        isFetchingWhoAmI,
        finishedFetching:
            !datasetIsFetching &&
            !publishersAreFetching &&
            !datasetSearchIsFetching &&
            !distributionIsFetching &&
            !publisherIsFetching
    };
};

const connector = connect(mapStateToProps);
type PropsFromRedux = ConnectedProps<typeof connector>;

interface Props extends PlainObject {
    finishedFetching?: boolean;
    location?: Location;
}

type AuthProps = {
    user: User;
    isFetchingWhoAmI: boolean;
    whoAmIError: Error | null;
};

const withHeader = (
    WrappedComponent: ComponentType<Props>,
    {
        includeSearchBox,
        includeDatasetPageProgressMeter,
        noContainerClass
    }: InterfaceOptions = {},
    addDatasetProgressMeterProps: AddDatasetProgressMeterProps = {}
) => {
    type AllProps = AuthProps & Props & PropsFromRedux;

    const NewComponent: React.FunctionComponent<AllProps> = (
        allProps: AllProps
    ) => {
        const { user, isFetchingWhoAmI, whoAmIError, ...props } = allProps;
        return (
            <div className="other-page">
                {HeaderPlugin ? (
                    <HeaderPlugin
                        isFetchingWhoAmI={allProps.isFetchingWhoAmI}
                        user={allProps.user}
                        whoAmIError={allProps.whoAmIError}
                    />
                ) : (
                    <Header />
                )}

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

    return connector(
        //@ts-ignore
        NewComponent
    );
};

export default memoize(withHeader);
