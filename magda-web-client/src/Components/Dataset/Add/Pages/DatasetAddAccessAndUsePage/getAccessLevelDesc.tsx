import React from "react";
import TooltipWrapper from "Components/Common/TooltipWrapper";
import helpIcon from "assets/help.svg";

const AccessLevelOrgOption = (
    <span>
        <span>Everyone in the organization (recommended) </span>
        <span className="tooltip-container">
            <TooltipWrapper
                className="tooltip no-print"
                launcher={() => (
                    <div className="tooltip-launcher-icon help-icon">
                        <img
                            src={helpIcon}
                            alt="More information on this option, click for more information"
                        />
                    </div>
                )}
                innerElementClassName="inner"
            >
                {() => (
                    <>
                        Please note: when the system administrator allow
                        anonymous users to access organization-wide visible
                        published datasets, your dataset will be visible to
                        anonymous users as well.
                    </>
                )}
            </TooltipWrapper>
        </span>
    </span>
);

export default function getAccessLevelDesc(
    level?: string,
    orgUnitName?: string
) {
    const orgStr = orgUnitName ? `(${orgUnitName}) ` : "";
    switch (level) {
        case "organization":
            return AccessLevelOrgOption;
        case "custodian":
            return `Within selected data custodian ${orgStr}only`;
        case "team":
            return `Within selected dataset managing team ${orgStr}only`;
        case "creatorOrgUnit":
            return `Within your current organizational unit ${orgStr}only`;
        case "selectedOrgUnit":
            return `Within selected organizational unit ${orgStr}only`;
        default:
            return "";
    }
}
