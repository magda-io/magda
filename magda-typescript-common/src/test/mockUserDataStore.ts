import * as uuid from "uuid";
import { User } from "src/authorization-api/model";

const mockUserData = [
{
        id: "00000000-0000-4000-8000-000000000000",
        displayName: "admin",
        email: "admin@admin.com",
        photoURL: "http://example.com",
        source: "manual",
        sourceId: "1",
        isAdmin: true
    },
    {
        id: "8D8931AF-86B3-104A-9B24-153491C6EA5E",
        displayName: "Standard User",
        email: "test@test.com",
        photoURL: "http://example.com",
        source: "ckan",
        sourceId: "testuser",
        isAdmin: false
    }
];

const mockUserDataStore = {
    getData:function(){
        return mockUserData;
    },
    getRecordBySourceAndSourceId(source:string, sourceId:string){
        return mockUserData.filter(record=>{
            return record.source == source && record.sourceId == sourceId;
        });
    },
    getRecordByUserId(userId:string){
        return mockUserData.filter(record=>{
            return record.id == userId;
        });
    },
    getRecordByIndex(idx:number){
        return mockUserData[idx];
    },
    createRecord(user:User){
        const newRecord:any={...user, id:uuid.v4()};
        mockUserData.push(newRecord);
        return newRecord;
    }
};
export default mockUserDataStore;
