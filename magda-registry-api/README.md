# Developer Note on Access Control

To test access control from localhost, follow the instructions:

#### Start combined-db container and forward port 5432.

#### Add "dataset-access-control" aspect definition.

#### Add a test orgUnit to orgUnits table in auth db

Set its ID to "a6ac60ff-baa9-4c74-9942-d851f185ed24".

#### Add a record with "dataset-access-control" aspect

Set the aspect's "orgUnitOwnerId" to "a6ac60ff-baa9-4c74-9942-d851f185ed24".
Set recordId to "testRecordId".

#### Add a user

Set orgUnitId "a6ac60ff-baa9-4c74-9942-d851f185ed24".
Set userId to "b6ac60ff-baa9-4c74-9942-d851f185ed24".
Assign the user with role having the read registry record permission and operation. See auth db for details.

#### Start opa

Run command 'docker-compose up' from directory "deploy/helm/magda/chart/opa".

#### Start authorization api with default port 6104.

#### Start registry api with default port 6101.

#### Create a jwt token

For the above userId "b6ac60ff-baa9-4c74-9942-d851f185ed24" and jwt secrete "squirrel", the jwt token may look like
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiNmFjNjBmZi1iYWE5LTRjNzQtOTk0Mi1kODUxZjE4NWV
However, the above token may have expired.

#### Test access control

Make GET request to registry api. The responses will be empty if the request has no header "X-Magda-Session = <jwtToken>"
or a user is from other org unit.
######## http://localhost:6101/v0/registry/records/testRecordId?aspect=dataset-access-control
######## http://localhost:6101/v0/registry/records?aspect=dataset-access-control
