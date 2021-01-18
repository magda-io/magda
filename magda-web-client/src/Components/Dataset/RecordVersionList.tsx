import React, { FunctionComponent } from "react";
import { VersionAspectData, VersionItem } from "api-clients/RegistryApis";
import moment from "moment";
import UserNameLabel from "Components/UserNameLabel";
import urijs from "urijs";
import "./RecordVersionList.scss";
import CommonLink from "Components/Common/CommonLink";

interface PropsType {
    versionData?: VersionAspectData;
    selectedVersion?: number;
    // --- user to generate record page url. e.g. /dataset/xxxx/distribution/xxxx/details
    recordPageBaseUrl: string;
    // --- if present, all query parameters with the specified name will be retrieved from the current url and append to generated recordPageUrl
    retainQueryParameterNames?: string[];
}

const createRecordPageUrl = (
    versionNumber: number,
    recordPageBaseUrl: string,
    retainQueryParameterNames?: string[]
): string => {
    const queries = retainQueryParameterNames?.length
        ? urijs(window.location.href).search(true)
        : {};
    const queriesToBeAppended = {
        version: versionNumber
    };

    if (retainQueryParameterNames?.length) {
        retainQueryParameterNames.forEach((key) => {
            const value = queries[key];
            if (value) {
                queriesToBeAppended[key] = value;
            }
        });
    }

    return urijs(recordPageBaseUrl)
        .search(queriesToBeAppended as any)
        .toString();
};

const VersionItemBox: FunctionComponent<{
    data: VersionItem;
    currentVersion: number;
    selectedVersion?: number;
    recordPageBaseUrl: string;
    retainQueryParameterNames?: string[];
}> = (props) => {
    const {
        data,
        selectedVersion,
        currentVersion,
        recordPageBaseUrl,
        retainQueryParameterNames
    } = props;
    const { versionNumber, createTime, creatorId, description, title } = data;
    const isSelected = selectedVersion === versionNumber ? true : false;
    const isCurrentVersion = currentVersion === versionNumber ? true : false;

    const recordPageUrl = createRecordPageUrl(
        versionNumber,
        recordPageBaseUrl,
        retainQueryParameterNames
    );

    return (
        <div className="record-version-item">
            <div className="record-version-item-header">
                <h3>
                    <CommonLink href={recordPageUrl}>
                        Version {versionNumber}
                    </CommonLink>

                    <span className="create-time-and-author-section">
                        {" "}
                        (Created on{" "}
                        {moment(createTime).format(
                            "Mo MMM YYYY hh:mm a"
                        )} by <UserNameLabel userId={creatorId} />)
                    </span>
                    {isCurrentVersion ? (
                        <span className="record-version-item-tag">
                            Current Version
                        </span>
                    ) : null}
                    {isSelected ? (
                        <span className="record-version-item-tag">
                            Selected Version
                        </span>
                    ) : null}
                </h3>
            </div>
            <div className="record-version-item-body">
                <p>Record Title: {title}</p>
                <p>{description}</p>
            </div>
        </div>
    );
};

const RecordVersionList: FunctionComponent<PropsType> = (props) => {
    const { versionData, selectedVersion, recordPageBaseUrl } = props;

    if (!versionData?.versions.length) {
        return null;
    }

    return (
        <div className="record-version-list">
            <h3 className="clearfix section-heading">
                <span className="section-heading">Version History</span>
            </h3>
            <div className="record-version-list-body">
                {versionData.versions
                    .map((item) => (
                        <VersionItemBox
                            key={item.versionNumber}
                            data={item}
                            currentVersion={versionData.currentVersionNumber}
                            selectedVersion={selectedVersion}
                            recordPageBaseUrl={recordPageBaseUrl}
                        />
                    ))
                    .reverse()}
            </div>
        </div>
    );
};

export default RecordVersionList;
