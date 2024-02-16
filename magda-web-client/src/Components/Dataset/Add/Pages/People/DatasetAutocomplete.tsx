import debouncePromise from "debounce-promise";
import { searchDatasets } from "api-clients/SearchApis";
import { DatasetAutocompleteChoice, createId } from "../../DatasetAddCommon";
import AsyncSelect from "react-select/async";
import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";
import { components } from "react-select";
import { User } from "reducers/userManagementReducer";
import TooltipWrapper from "Components/Common/TooltipWrapper";
import ExplanationTooltipContent from "Components/Common/ExplanationTooltipContent";
import { retrieveLocalData, setLocalData } from "storage/localStorage";
import CommonLink from "Components/Common/CommonLink";
import { MultiValueProps } from "react-select";
import "./DatasetAutocomplete.scss";

const LS_KEY_HIDE_TOOLTIP = "magda-hide-dataset-autocomplete-tooltip";

type Props = {
    onDatasetSelected: (
        choices: DatasetAutocompleteChoice[] | undefined
    ) => void;
    value?: DatasetAutocompleteChoice[];
    user: User;
};

type Choice = {
    value: string;
    label: string;
    existingId?: string;
    shouldShowTooltip?: boolean;
};

function fromReactSelect(choice: Choice): DatasetAutocompleteChoice {
    return {
        existingId: choice.existingId,
        name: choice.label,
        shouldShowTooltip: choice.shouldShowTooltip
    };
}

function toReactSelectValue(choice: DatasetAutocompleteChoice): Choice {
    return {
        existingId: choice.existingId,
        value: choice.existingId || choice.name,
        label: choice.name,
        shouldShowTooltip: choice.shouldShowTooltip
    };
}

const CustomMultiValue = (props: MultiValueProps<Choice, true>) => {
    const showTooltip = (props.data as Choice).shouldShowTooltip;
    const component = <components.MultiValue {...props} />;

    return showTooltip ? (
        <TooltipWrapper
            launcher={() => component}
            startOpen={true}
            requireClickToDismiss={true}
            orientation="below"
        >
            {(dismiss) => (
                <ExplanationTooltipContent dismiss={dismiss}>
                    This has been added as a draft dataset. You can edit it from
                    your{" "}
                    <CommonLink
                        href="/dataset/list"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        drafts page
                    </CommonLink>
                    .
                </ExplanationTooltipContent>
            )}
        </TooltipWrapper>
    ) : (
        component
    );
};

export default function DatasetAutocomplete(props: Props) {
    const query: (term: string) => Promise<any> = debouncePromise(
        async (term: string) => {
            const apiResult = await searchDatasets({ q: term, limit: 4 });

            const result = await apiResult.dataSets.map((option) => ({
                existingId: option.identifier,
                value: option.identifier,
                label: option.title
            }));

            const addChoice = (dataset: DatasetAutocompleteChoice) => {
                props.onDatasetSelected(
                    props.value ? [...props.value, dataset] : [dataset]
                );
            };

            return [
                {
                    label: "Existing datasets in your catalog",
                    options: result
                },
                {
                    label: "Add this as a new dataset to your catalog",
                    options: [
                        {
                            label: `Add new: "${term}"`,
                            isCustomItem: true,
                            itemSelectHandler: () => {
                                // --- only generate id here will create datasets when submit
                                const newDatasetId = createId();

                                addChoice({
                                    existingId: newDatasetId,
                                    name: term,
                                    shouldShowTooltip: !retrieveLocalData(
                                        LS_KEY_HIDE_TOOLTIP,
                                        false
                                    )
                                });

                                setLocalData(LS_KEY_HIDE_TOOLTIP, true);
                            }
                        }
                    ]
                },
                {
                    label: "Don't add anything for now",
                    options: [
                        {
                            label: `Use name: "${term}"`,
                            isCustomItem: true,
                            itemSelectHandler: () => {
                                addChoice({
                                    name: term
                                });
                            }
                        }
                    ]
                }
            ];
        },
        200
    );

    return (
        <AsyncSelect
            className="react-select"
            isMulti={true}
            isSearchable={true}
            onChange={(rawValue) => {
                if (!rawValue) {
                    props.onDatasetSelected(undefined);
                } else {
                    const selectedItems = rawValue as any[];

                    // Assume that the last selected item is the one just added.
                    // If the selected item is custom, let its "itemSelectHandler"
                    // method handle the change. For non-custom elements just call
                    // onDatasetSelected directly.
                    if (
                        selectedItems.length &&
                        selectedItems[selectedItems.length - 1] &&
                        selectedItems[selectedItems.length - 1].isCustomItem ===
                            true
                    ) {
                        selectedItems[
                            selectedItems.length - 1
                        ].itemSelectHandler();
                    } else {
                        props.onDatasetSelected(
                            (rawValue as Choice[]).map(fromReactSelect)
                        );
                    }
                }
            }}
            styles={{
                ...ReactSelectStyles,
                valueContainer: (provided) => ({
                    ...provided,
                    overflow: "visible"
                })
            }}
            value={
                props.value ? props.value!.map(toReactSelectValue) : props.value
            }
            loadOptions={query}
            placeholder="Search for dataset"
            components={{
                MultiValue: CustomMultiValue
            }}
        />
    );
}
