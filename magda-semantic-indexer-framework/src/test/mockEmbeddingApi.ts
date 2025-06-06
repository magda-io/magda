import nock from "nock";

export default function mockEmbeddingApi(
    baseUrl: string = "http://localhost:3000",
    path: string = "/v1/embeddings",
    dim: number = 768
) {
    nock(baseUrl)
        .persist()
        .post(path)
        .reply((_: any, requestBody: any) => {
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
                    data: input.map(() => ({
                        embedding: Array(dim).fill(Math.random())
                    }))
                }
            ];
        });
}
