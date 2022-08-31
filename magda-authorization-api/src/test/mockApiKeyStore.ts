import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { APIKeyRecord } from "magda-typescript-common/src/authorization-api/model";

const mockUserApiKeyData = [
    {
        id: "26c3f060-32ea-4036-8b3d-58b9d3c106e6",
        user_id: "00000000-0000-4000-8000-000000000000",
        created_timestamp: new Date("2020-07-09 05:24:08.097496+00"),
        hash: "$2b$12$S/gGgIar7ogT/Sbs0qSfGOKvurecKK1wA82NXIKPBfaqZuzNC6cvS",
        enabled: true
    },
    {
        id: "5e73cfcc-a098-4b89-855f-ac4da5a12fa1",
        user_id: "8D8931AF-86B3-104A-9B24-153491C6EA5E",
        created_timestamp: new Date("2020-07-09 03:58:43.26348+00"),
        hash: "$2b$12$0fwbBhcJ.aP0scq66Z7aT.XD2zEUYpO3m8QoT2qUQE8w/qJ5Fw9My",
        enabled: true
    }
] as APIKeyRecord[];

let runtimeApiKeyStore: APIKeyRecord[];
const SALT_ROUNDS = 10;

const mockApiKeyStore = {
    reset: function () {
        runtimeApiKeyStore = mockUserApiKeyData.map((item) => ({ ...item }));
    },

    async create(userId: string, apiKey: string) {
        const newRecord = {
            id: uuidv4(),
            user_id: userId,
            created_timestamp: new Date(),
            hash: await bcrypt.hash(apiKey, SALT_ROUNDS),
            enabled: true
        };

        runtimeApiKeyStore.push(newRecord);
        return newRecord;
    },

    getData: function () {
        return runtimeApiKeyStore;
    },

    getRecordById(id: string) {
        return runtimeApiKeyStore.find((record) => {
            return record.id == id;
        });
    },

    async updateApiKeyAttempt(apiKeyId: string, isSuccessfulAttempt: Boolean) {
        const apiKeyRecord = runtimeApiKeyStore.find(
            (item) => item.id === apiKeyId
        );
        if (apiKeyRecord) {
            if (isSuccessfulAttempt) {
                apiKeyRecord.last_successful_attempt_time = new Date();
            } else {
                apiKeyRecord.last_failed_attempt_time = new Date();
            }
        }
    }
};

mockApiKeyStore.reset();

export default mockApiKeyStore;
