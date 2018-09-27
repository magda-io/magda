import mockContentDataStore from "./mockContentStore";
import { Maybe } from "tsmonad";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";

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
}
