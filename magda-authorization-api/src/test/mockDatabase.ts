import mockUserDataStore from "@magda/typescript-common/dist/test/mockUserDataStore";
import { User } from "@magda/typescript-common/dist/authorization-api/model";
import { Maybe } from "tsmonad";
import arrayToMaybe from "@magda/typescript-common/dist/util/arrayToMaybe";

export default class MockDatabase {
    getUser(id: string): Promise<Maybe<User>> {
        return new Promise(function(resolve, reject) {
            resolve(
                arrayToMaybe(
                    mockUserDataStore.getRecordByUserId(id).map(
                        item =>
                            ({
                                id: item.id,
                                email: item.email,
                                displayName: item.displayName,
                                photoURL: item.photoURL,
                                source: item.source,
                                isAdmin: item.isAdmin
                            } as User)
                    )
                )
            );
        });
    }

    getUserByExternalDetails(
        source: string,
        sourceId: string
    ): Promise<Maybe<User>> {
        return new Promise(function(resolve, reject) {
            resolve(
                arrayToMaybe(
                    mockUserDataStore
                        .getRecordBySourceAndSourceId(source, sourceId)
                        .map(item => ({
                            id: item.id,
                            email: item.email,
                            displayName: item.displayName,
                            photoURL: item.photoURL,
                            source: item.source,
                            sourceId: item.sourceId,
                            isAdmin: item.isAdmin
                        }))
                )
            );
        });
    }

    createUser(user: User): Promise<User> {
        return new Promise(function(resolve, reject) {
            resolve(mockUserDataStore.createRecord(user));
        });
    }

    check() {}
}
