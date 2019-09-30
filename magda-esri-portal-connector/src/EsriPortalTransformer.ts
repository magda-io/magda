import ConnectorRecordId from "@magda/typescript-common/dist/ConnectorRecordId";
import {
    AspectDefinition,
    Record
} from "@magda/typescript-common/dist/generated/registry/api";
import JsonTransformer from "@magda/typescript-common/dist/JsonTransformer";
import {
    CompiledAspects,
    JsonTransformerOptions,
    BuilderSetupFunctionParameters,
    BuilderFunctionParameters,
    buildersToCompiledAspects
} from "@magda/typescript-common/dist/JsonTransformer";
import AspectBuilder from "@magda/typescript-common/dist/AspectBuilder";

type EsriJsonTransformerOptions = JsonTransformerOptions & {
    groupAspectBuilders: AspectBuilder[];
};

export default class EsriPortalTransformer extends JsonTransformer {
    private groupAspectBuilders: AspectBuilder[];
    private groupAspects: CompiledAspects;

    constructor(options: EsriJsonTransformerOptions) {
        super(options);

        this.groupAspectBuilders = options.groupAspectBuilders.slice();
        const libraries = options.libraries;

        const setupParameters: BuilderSetupFunctionParameters = {
            transformer: this,
            libraries
        };

        const groupParameters = new GroupBuilderFunctionParameters();
        groupParameters.libraries = libraries;
        groupParameters.transformer = this;

        this.groupAspects = buildersToCompiledAspects(
            options.groupAspectBuilders,
            setupParameters,
            groupParameters
        );
    }

    public groupJsonToRecord(jsonGroup: object): Record {
        this.groupAspects.parameters.group = jsonGroup;
        const id = this.getIdFromJsonGroup(jsonGroup, this.sourceId);
        const name = this.getNameFromJsonGroup(jsonGroup);
        const theRecord = super.jsonToRecord(
            id,
            name,
            jsonGroup,
            this.groupAspects
        );
        return this.reviseGroupRecord(theRecord);
    }

    getRequiredAspectDefinitions(): AspectDefinition[] {
        const definitions = super.getRequiredAspectDefinitions();
        const alldefs = definitions.concat(
            this.groupAspectBuilders.map(builder => builder.aspectDefinition)
        );
        return alldefs;
    }

    getIdFromJsonOrganization(
        jsonOrganization: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(
            jsonOrganization.id,
            "Organization",
            sourceId
        );
    }

    getIdFromJsonGroup(jsonGroup: any, sourceId: string): ConnectorRecordId {
        return new ConnectorRecordId(jsonGroup.id, "Group", sourceId);
    }

    getNameFromJsonGroup(jsonGroup: any): string {
        return jsonGroup.title;
    }

    reviseGroupRecord(record: Record): Record {
        return record;
    }

    getIdFromJsonDataset(
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(jsonDataset.id, "Dataset", sourceId);
    }

    getIdFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(
            jsonDistribution.id,
            "Distribution",
            sourceId
        );
    }

    getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.title || jsonOrganization.name;
    }

    getNameFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.title || jsonDataset.name || jsonDataset.id;
    }

    getNameFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        return (
            jsonDistribution.title ||
            jsonDistribution.name ||
            jsonDistribution.id
        );
    }
}

class GroupBuilderFunctionParameters extends BuilderFunctionParameters {
    /**
     * The JSON group from which to build aspects.
     *
     * @type {object}
     * @memberOf GroupBuilderFunctionParameters
     */
    group: object = undefined;
}
