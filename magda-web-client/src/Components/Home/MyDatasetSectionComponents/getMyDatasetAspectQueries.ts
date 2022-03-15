import {
    AspectQuery,
    AspectQueryOperators,
    DatasetTypes
} from "api-clients/RegistryApis";

export default function getMyDatasetAspectQueries(
    datasetType: DatasetTypes,
    userId: string,
    searchText: string
) {
    const aspectQueries: AspectQuery[] = [];

    searchText = searchText?.trim();

    if (datasetType === "drafts") {
        aspectQueries.push(
            new AspectQuery(
                "publishing.state",
                AspectQueryOperators["="],
                `draft`,
                true
            )
        );
    } else {
        aspectQueries.push(
            new AspectQuery(
                "publishing.state",
                AspectQueryOperators["="],
                `published`,
                true
            )
        );
    }

    if (searchText) {
        // --- generate keyword search
        if (datasetType === "drafts") {
            aspectQueries.push(
                new AspectQuery(
                    "dataset-draft.dataset.title",
                    AspectQueryOperators.patternMatch,
                    `%${searchText}%`,
                    false
                ),
                new AspectQuery(
                    "dataset-draft.dataset.description",
                    AspectQueryOperators.patternMatch,
                    `%${searchText}%`,
                    false
                ),
                new AspectQuery(
                    "dataset-draft.dataset.themes",
                    AspectQueryOperators.patternMatch,
                    `%${searchText}%`,
                    false
                ),
                new AspectQuery(
                    "dataset-draft.dataset.keywords",
                    AspectQueryOperators.patternMatch,
                    `%${searchText}%`,
                    false
                )
            );
        } else {
            aspectQueries.push(
                new AspectQuery(
                    "dcat-dataset-strings.title",
                    AspectQueryOperators.patternMatch,
                    `%${searchText}%`,
                    false
                ),
                new AspectQuery(
                    "dcat-dataset-strings.description",
                    AspectQueryOperators.patternMatch,
                    `%${searchText}%`,
                    false
                ),
                new AspectQuery(
                    "dcat-dataset-strings.themes",
                    AspectQueryOperators.patternMatch,
                    `%${searchText}%`,
                    false
                ),
                new AspectQuery(
                    "dcat-dataset-strings.keywords",
                    AspectQueryOperators.patternMatch,
                    `%${searchText}%`,
                    false
                )
            );
        }
    }

    return aspectQueries;
}
