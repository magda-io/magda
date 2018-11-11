import JsonTransformer, { JsonTransformerOptions } from "src/JsonTransformer";
import ConnectorRecordId from "src/ConnectorRecordId";
import { expect } from "chai";
import "mocha";
import AspectBuilder from "src/AspectBuilder";
import * as fs from "fs";
import cleanOrgTitle from "src/util/cleanOrgTitle";
import * as moment from "moment";
import * as URI from "urijs";

describe("JsonTransformer", () => {
    describe("organizationJsonToRecord", () => {
        let transformerOptions: JsonTransformerOptions;

        beforeEach(() => {
            const organizationAspectBuilders: AspectBuilder[] = [
                {
                    aspectDefinition: {
                        id: "source",
                        name: "Source",
                        jsonSchema: require("@magda/registry-aspects/source.schema.json")
                    },
                    builderFunctionString: fs.readFileSync(
                        "src/test/aspect-templates/organization-source.js",
                        "utf8"
                    )
                },
                {
                    aspectDefinition: {
                        id: "organization-details",
                        name: "Organization",
                        jsonSchema: require("@magda/registry-aspects/organization-details.schema.json")
                    },
                    builderFunctionString: fs.readFileSync(
                        "src/test/aspect-templates/organization-details.js",
                        "utf8"
                    )
                }
            ];

            transformerOptions = {
                sourceId: "test",
                organizationAspectBuilders,
                libraries: {
                    cleanOrgTitle: cleanOrgTitle,
                    moment: moment,
                    URI: URI
                }
            };
        });

        it("should remove useless descrition when checkDescriptionFromJsonOrganization() is true", () => {
            const transformer = new JsonTransformerWithCheck(
                transformerOptions
            );
            const organization = JSON.parse(
                '{"description": "A little information about my organization...", \
                "id": "123", "name": "abc", "type": "organization"}'
            );
            const theRecord = transformer.organizationJsonToRecord(
                organization
            );
            expect(
                theRecord.aspects["organization-details"].description
            ).to.equal("");
        });

        it("should keep useful descrition when checkDescriptionFromJsonOrganization() is true", () => {
            const transformer = new JsonTransformerWithCheck(
                transformerOptions
            );
            const organization = JSON.parse(
                '{"description": "A little information about my organization", \
                "id": "456", "name": "def", "type": "organization"}'
            );
            const theRecord = transformer.organizationJsonToRecord(
                organization
            );
            expect(
                theRecord.aspects["organization-details"].description
            ).to.equal("A little information about my organization");
        });

        it("should keep any descrition when checkDescriptionFromJsonOrganization() is false", () => {
            const transformer = new JsonTransformerWithoutCheck(
                transformerOptions
            );
            const organization = JSON.parse(
                '{"description": "A little information about my organization...", \
                "id": "123456", "name": "abc def", "type": "organization"}'
            );
            const theRecord = transformer.organizationJsonToRecord(
                organization
            );
            expect(
                theRecord.aspects["organization-details"].description
            ).to.equal("A little information about my organization...");
        });
    });
});

class JsonTransformerWithCheck extends JsonTransformer {
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
        return (
            jsonOrganization.display_name ||
            jsonOrganization.title ||
            jsonOrganization.name ||
            jsonOrganization.id
        );
    }

    checkDescriptionFromJsonOrganization(): boolean {
        return true;
    }

    getNameFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.title || jsonDataset.name || jsonDataset.id;
    }

    getNameFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        return jsonDistribution.name || jsonDistribution.id;
    }
}

class JsonTransformerWithoutCheck extends JsonTransformerWithCheck {
    checkDescriptionFromJsonOrganization(): boolean {
        return false;
    }
}
