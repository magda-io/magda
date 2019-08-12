# Developer Note on Access Control

To test access control from localhost, follow the instructions:

#### Start combined-db container and forward port 5432.

#### Add "dataset-access-control" aspect definition.

#### Add two unrelated org units to table orgUnits table in auth db

("Unrelated units" means their [left, right]s do not overlap each other.)
orgUnit1:
id = a0000000-0000-0000-0000-000000000001
left = 0
right = 100

orgUnit2:
id = a0000000-0000-0000-0000-000000000002
left = 1000
right = 2000

#### Add some records

POST to http://localhost:6101/v0/records to add records.

Add a record owned by orgUnit1:
{
"id": "aTestRecordId1",
"name": "a test record id 1",
"aspects": {
"dataset-access-control":{
"orgUnitOwnerId": "a0000000-0000-0000-0000-000000000001"
},
"organization-details": {
"name": "organization for aTestRecordId1",
"email": "recordId1@recordId.somewhere"
}
}
}

Add a record owned by orgUnit2:
{
"id": "aTestRecordId2",
"name": "a test record id 2",
"aspects": {
"dataset-access-control":{
"orgUnitOwnerId": "a0000000-0000-0000-0000-000000000002"
},
"organization-details": {
"name": "organization for aTestRecordId2",
"email": "recordId2@recordId.somewhere"
}
}
}

Add a record without access control aspect:
{
"id": "aTestRecordId3",
"name": "a test record id 3",
"aspects": {
"organization-details": {
"name": "organization for aTestRecordId3",
"email": "recordId3@recordId.somewhere"
}
}
}

#### Add a user

Set userId to "b6ac60ff-ba9-4c74-9942-d851f185ed24".
Set its orgUnitId to be the ID of orgUnit1, that is, "a0000000-0000-0000-0000-000000000001".
Assign the user with role having the read registry record permission and operation. See auth db for details.

#### Start opa

Run command 'docker-compose up' from directory "deploy/helm/magda/chart/opa".

#### Start authorization api with default port 6104.

#### Start registry api with default port 6101.

#### Create a jwt token

For the above userId "b6ac60ff-ba9-4c74-9942-d851f185ed24" and jwt secrete "squirrel", the jwt token may look like
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiNmFjNjBmZi1iYWE5LTRjNzQtOTk0Mi1kODUxZjE4NWV
However, the above token may have expired.

#### Test access control

##### Make GET request to registry api as the above authenticated user.

(With header: "X-Magda-Session = <jwtToken>")

1. Get "aTestRecordId1"
   The access control aspect matches user's profile.
   http://localhost:6101/v0/records/aTestRecordId1?organization-details
   {
   "aspects": {
   "organization-details": {
   "email": "recordId1@recordId.somewhere",
   "name": "organization for aTestRecordId1"
   }
   },
   "id": "aTestRecordId1",
   "name": "a test record id 1"
   }

http://localhost:6101/v0/records/aTestRecordId1?aspect=organization-details&aspect=dataset-access-control
{
"aspects": {
"dataset-access-control": {
"orgUnitOwnerId": "a0000000-0000-0000-0000-000000000001"
},
"organization-details": {
"email": "recordId1@recordId.somewhere",
"name": "organization for aTestRecordId1"
}
},
"id": "aTestRecordId1",
"name": "a test record id 1"
}

2. Get "aTestRecordId2"
   The access control aspect does not match user's profile.
   http://localhost:6101/v0/records/aTestRecordId2?organization-details
   http://localhost:6101/v0/records/aTestRecordId2?aspect=organization-details&aspect=dataset-access-control
   {
   "message": "No record exists with that ID or it does not have the required aspects."
   }

3. Get ""aTestRecordId3"
   The record does not have access control aspect.
   http://localhost:6101/v0/records/aTestRecordId3?aspect=organization-details
   {
   "aspects": {
   "organization-details": {
   "email": "recordId3@recordId.somewhere",
   "name": "organization for aTestRecordId3"
   }
   },
   "id": "aTestRecordId3",
   "name": "a test record id 3"
   }

http://localhost:6101/v0/records/aTestRecordId3?aspect=organization-details&aspect=dataset-access-control
{
"message": "No record exists with that ID or it does not have the required aspects."
}

4. Get records
   http://localhost:6101/v0/records?aspect=organization-details
   {
   "hasMore": false,
   "records": [
   {
   "aspects": {
   "organization-details": {
   "email": "recordId1@recordId.somewhere",
   "name": "organization for aTestRecordId1"
   }
   },
   "id": "aTestRecordId1",
   "name": "a test record id 1"
   },
   {
   "aspects": {
   "organization-details": {
   "email": "recordId3@recordId.somewhere",
   "name": "organization for aTestRecordId3"
   }
   },
   "id": "aTestRecordId3",
   "name": "a test record id 3"
   }
   ]
   }

http://localhost:6101/v0/records?aspect=organization-details&aspect=dataset-access-control
{
"hasMore": false,
"records": [
{
"aspects": {
"dataset-access-control": {
"orgUnitOwnerId": "a0000000-0000-0000-0000-000000000001"
},
"organization-details": {
"email": "recordId1@recordId.somewhere",
"name": "organization for aTestRecordId1"
}
},
"id": "aTestRecordId1",
"name": "a test record id 1"
}
]
}

http://localhost:6101/v0/records
{
"hasMore": false,
"records": [
{
"aspects": {},
"id": "aTestRecordId1",
"name": "a test record id 1"
},
{
"aspects": {},
"id": "aTestRecordId3",
"name": "a test record id 3"
}
]
}

##### Make GET request to registry api as anonymous user

(Without header "X-Magda-Session = <jwtToken>")

1. Get "aTestRecordId1"
   The anonymous user's profile does not match access control aspect.
   http://localhost:6101/v0/records/aTestRecordId1?organization-details
   http://localhost:6101/v0/records/aTestRecordId1?aspect=organization-details&aspect=dataset-access-control
   {
   "message": "No record exists with that ID or it does not have the required aspects."
   }

2. Get "aTestRecordId2"
   The anonymous user's profile does not match access control aspect.
   http://localhost:6101/v0/records/aTestRecordId2?organization-details
   http://localhost:6101/v0/records/aTestRecordId2?aspect=organization-details&aspect=dataset-access-control
   {
   "message": "No record exists with that ID or it does not have the required aspects."
   }

3. Get ""aTestRecordId3"
   The record does not have access control aspect.
   http://localhost:6101/v0/records/aTestRecordId3?aspect=organization-details
   {
   "aspects": {
   "organization-details": {
   "email": "recordId3@recordId.somewhere",
   "name": "organization for aTestRecordId3"
   }
   },
   "id": "aTestRecordId3",
   "name": "a test record id 3"
   }

http://localhost:6101/v0/records/aTestRecordId3?aspect=organization-details&aspect=dataset-access-control
{
"message": "No record exists with that ID or it does not have the required aspects."
}

4. Get records
   http://localhost:6101/v0/records?aspect=organization-details
   {
   "hasMore": false,
   "records": [
   {
   "aspects": {
   "organization-details": {
   "email": "recordId3@recordId.somewhere",
   "name": "organization for aTestRecordId3"
   }
   },
   "id": "aTestRecordId3",
   "name": "a test record id 3"
   }
   ]
   }

http://localhost:6101/v0/records?aspect=organization-details&aspect=dataset-access-control
{
"hasMore": false,
"records": []
}

http://localhost:6101/v0/records
{
"hasMore": false,
"records": [
{
"aspects": {},
"id": "aTestRecordId3",
"name": "a test record id 3"
}
]
}
