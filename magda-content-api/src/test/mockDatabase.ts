import mockContentDataStore from "./mockContentStore";
import { Maybe } from "tsmonad";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";
const wildcard = require("wildcard");

import { Content } from "../model";

export default class MockDatabase {
    getContentById(id: string): Promise<Maybe<Content>> {
        return new Promise(function(resolve, reject) {
            resolve(
                arrayToMaybe(
                    mockContentDataStore.getContentById(id).map(
                        item =>
                            ({
                                id: item.id,
                                content: item.content
                            } as Content)
                    )
                )
            );
        });
    }
    setContentById(id: string, type: string, content: string): Promise<any> {
        return new Promise(function(resolve, reject) {
            resolve(mockContentDataStore.setContentById(id, type, content));
        });
    }
    getContentSummary() {
        return mockContentDataStore.getContentSummary();
    }

    deleteContentById(id: string) {
        return mockContentDataStore.deleteContentById(id);
    }

    createWildcardMatch(field: string, pattern: string) {
        return (item: any) =>
            item[field] === pattern || wildcard(pattern, field);
    }

    createOr(...queries: any[]) {
        return (item: any) => queries.filter(query => query(item)).length > 0;
    }
}
