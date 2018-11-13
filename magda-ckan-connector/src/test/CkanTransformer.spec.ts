import { expect } from "chai";
import "mocha";
import { transformer } from "src/setup";

describe("CkanTransformer", () => {
    describe("organizationJsonToRecord", () => {
        it("should not record the default description", () => {
            const organization = JSON.parse(
                `{
                    "description": "A little information about my organization...",
                    "id": "123", 
                    "name": "abc"
                }`
            );
            const theRecord = transformer.organizationJsonToRecord(
                organization
            );
            expect(theRecord.id).to.equal("org-test-123");
            expect(theRecord.name).to.equal("abc");

            const organizationDetailsAspect =
                theRecord.aspects["organization-details"];
            expect(organizationDetailsAspect.description).to.equal("");
            expect(organizationDetailsAspect.name).to.equal("abc");
        });

        it("should not revise the non-default description", () => {
            const organization = JSON.parse(
                `{
                    "description": "This description should be kept.",
                    "id": "456", 
                    "name": "def"
                }`
            );
            const theRecord = transformer.organizationJsonToRecord(
                organization
            );
            expect(
                theRecord.aspects["organization-details"].description
            ).to.equal("This description should be kept.");
        });
    });
});
