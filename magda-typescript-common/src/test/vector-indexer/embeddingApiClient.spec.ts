import nock from "nock";
import EmbeddingApiClient from "../../EmbeddingApiClient.js";
import { expect } from "chai";

export function mockEmbeddingApi(
    baseUrl: string = "http://localhost:3000",
    path: string = "",
    dim: number = 768
) {
    nock(baseUrl)
        .persist()
        .post(path)
        .reply((uri, requestBody: any) => {
            let input: string[] = [];
            try {
                input = Array.isArray(requestBody.input)
                    ? requestBody.input
                    : [requestBody.input];
            } catch {
                return [400, {}];
            }
            return [
                200,
                {
                    data: input.map(() => ({ embedding: Array(dim).fill(0.1) }))
                }
            ];
        });
}

describe("EmbeddingApiClient", () => {
    const baseApiUrl = "http://localhost:3000";
    const path = "/v1/embeddings";
    const dim = 768;
    let client: EmbeddingApiClient;

    before(() => {
        mockEmbeddingApi(baseApiUrl, path, dim);
        client = new EmbeddingApiClient({ baseApiUrl: baseApiUrl });
    });

    after(() => {
        nock.cleanAll();
    });

    it("should return embedding for single text", async () => {
        const vec = await client.get("hello world");
        expect(vec).to.be.an.instanceOf(Array);
        expect(vec.length).to.equal(dim);
    });

    it("should return embeddings for batch texts", async () => {
        const vecs = await client.get(["foo", "bar"]);
        expect(vecs).to.be.an.instanceOf(Array);
        expect(vecs[0]).to.be.an.instanceOf(Array);
        expect(vecs.length).to.equal(2);
        expect(vecs[0].length).to.equal(dim);
    });

    it("should properly handle large text arrays by batch", async () => {
        const texts = Array(40).fill("test text");
        const vecs = await client.get(texts);
        expect(vecs).to.be.an.instanceOf(Array);
        expect(vecs.length).to.equal(40);
        vecs.forEach((vec) => {
            expect(vec.length).to.equal(dim);
        });
    });
});
