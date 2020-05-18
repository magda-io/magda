import React, { FunctionComponent } from "react";

import { State } from "../../DatasetAddCommon";

import CollapseBox from "./CollapseBox";
import CollapseItem from "./CollapseItem";

import * as codelists from "constants/DatasetConstants";
import DescriptionBox from "Components/Common/DescriptionBox";
import ValidationRequiredLabel from "../../ValidationRequiredLabel";
import { shouldValidate } from "../../ValidationManager";
import { useAsync } from "react-async-hook";
import { getOrgUnitById } from "api-clients/OrgUnitApis";

type PropsType = {
    stateData: State;
};

const PeopleAndProduction: FunctionComponent<PropsType> = props => {
    const { dataset, datasetPublishing, provenance } = props.stateData;

    const {
        loading: custodianOrgUnitNameLoading,
        result: custodianOrgUnitName,
        error: custodianOrgUnitNameError
    } = useAsync(
        async custodianOrgUnitId => {
            try {
                if (!custodianOrgUnitId) {
                    return codelists.NO_VALUE_LABEL;
                }
                const orgUnit = await getOrgUnitById(custodianOrgUnitId);
                return orgUnit.name;
            } catch (e) {
                console.error(e);
                throw e;
            }
        },
        [dataset.custodianOrgUnitId]
    );

    const {
        loading: owningOrgUnitNameLoading,
        result: owningOrgUnitName,
        error: owningOrgUnitNameError
    } = useAsync(
        async owningOrgUnitId => {
            try {
                if (!owningOrgUnitId) {
                    return codelists.NO_VALUE_LABEL;
                }
                const orgUnit = await getOrgUnitById(owningOrgUnitId);
                return orgUnit.name;
            } catch (e) {
                console.error(e);
                throw e;
            }
        },
        [dataset.owningOrgUnitId]
    );

    return (
        <CollapseBox
            heading="People and production"
            stepNum={2}
            className="people-and-production"
        >
            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.publisher")}
            >
                <div className="col-sm-3">
                    <div className="title-box">
                        Organisation responsible for publication
                        <ValidationRequiredLabel validationFieldPath="$.dataset.publisher" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.publisher?.name
                        ? dataset.publisher.name
                        : codelists.NO_VALUE_LABEL}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.custodianOrgUnitId")}
            >
                <div className="col-sm-3">
                    <div className="title-box">
                        Data Custodian
                        <ValidationRequiredLabel validationFieldPath="$.dataset.custodianOrgUnitId" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {custodianOrgUnitNameLoading
                        ? "Loading..."
                        : custodianOrgUnitNameError
                        ? "Data custodian name unavailable"
                        : custodianOrgUnitName}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.dataset.owningOrgUnitId")}
            >
                <div className="col-sm-3">
                    <div className="title-box">
                        Dataset maintaining team
                        <ValidationRequiredLabel validationFieldPath="$.dataset.owningOrgUnitId" />
                        :
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {owningOrgUnitNameLoading
                        ? "Loading..."
                        : owningOrgUnitNameError
                        ? "Dataset maintaining team name unavailable"
                        : owningOrgUnitName}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate(
                    "$.datasetPublishing.contactPointDisplay"
                )}
            >
                <div className="col-sm-3">
                    <div className="title-box">
                        How should the contact point(s) be referenced in the
                        metadata
                        <ValidationRequiredLabel validationFieldPath="$.datasetPublishing.contactPointDisplay" />
                        ?
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {datasetPublishing?.contactPointDisplay
                        ? codelists.contactPointDisplay[
                              datasetPublishing.contactPointDisplay
                          ]
                        : codelists.NO_VALUE_LABEL}
                </div>
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.provenance.mechanism")}
            >
                <div className="col-sm-3">
                    <div className="title-box ">
                        How was this dataset produced
                        <ValidationRequiredLabel validationFieldPath="$.provenance.mechanism" />
                        ?
                    </div>
                </div>
                <DescriptionBox
                    className="col-sm-9 content-box"
                    isAutoTruncate={false}
                    content={
                        provenance?.mechanism
                            ? provenance.mechanism
                            : codelists.NO_VALUE_LABEL
                    }
                />
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.provenance.sourceSystem")}
            >
                <div className="col-sm-3">
                    <div className="title-box ">
                        What system (if any) was used to produce the data
                        <ValidationRequiredLabel validationFieldPath="$.provenance.sourceSystem" />
                        ?
                    </div>
                </div>
                <DescriptionBox
                    className="col-sm-9 content-box"
                    isAutoTruncate={false}
                    content={
                        provenance?.sourceSystem
                            ? provenance.sourceSystem
                            : codelists.NO_VALUE_LABEL
                    }
                />
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate(
                    "$.provenance.affiliatedOrganizations[0]"
                )}
            >
                <div className="col-sm-3">
                    <div className="title-box">
                        Other organisations that this dataset is produced in
                        collaboration with
                        <ValidationRequiredLabel validationFieldPath="$.provenance.affiliatedOrganizations[0]" />
                        :
                    </div>
                </div>
                <DescriptionBox
                    className="col-sm-9 content-box"
                    isAutoTruncate={false}
                    content={
                        provenance?.affiliatedOrganizations?.[0]?.name
                            ? provenance.affiliatedOrganizations
                                  .map(item => `- ${item.name}`)
                                  .join("\n")
                            : codelists.NO_VALUE_LABEL
                    }
                />
            </CollapseItem>

            <CollapseItem
                className="row"
                alwaysShow={shouldValidate("$.provenance.derivedFrom[0]")}
            >
                <div className="col-sm-3">
                    <div className="title-box">
                        What datasets (if any) was this data derived from
                        <ValidationRequiredLabel validationFieldPath="$.provenance.derivedFrom[0]" />
                        ?
                    </div>
                </div>
                <DescriptionBox
                    className="col-sm-9 content-box"
                    isAutoTruncate={false}
                    content={
                        provenance?.derivedFrom?.[0]?.name
                            ? provenance.derivedFrom
                                  .map(item => `- ${item.name}`)
                                  .join("\n")
                            : codelists.NO_VALUE_LABEL
                    }
                />
            </CollapseItem>
        </CollapseBox>
    );
};

export default PeopleAndProduction;
