package object.record

test_not_allow_data_steward_user_create_his_own_record {
    # data_steward only alow create dataset not record
     # "dcat-dataset-strings" is required
    not allow with input as {
      "object": {
        "record": {
          "name": "",
          "lastUpdate": null,
          "sourceTag": "",
          "id": "40a390dc-d008-4765-9e84-28cacae49751",
          "publishing": {
            "state": "published"
          },
          "dataset-draft": {
            "data": "{}",
            "dataset": {
              "name": "test dataset"
            },
            "timestamp": "2022-04-11T12:52:24.278Z"
          },
          "tenantId": 0,
          "access-control": {
            "ownerId": "8f414dab-cc51-4b5b-b790-4271da4f75a9"
          }
        }
      },
      "user": {
        "id": "8f414dab-cc51-4b5b-b790-4271da4f75a9",
        "displayName": "Test dataStewardUser",
        "email": "dataStewward@test.com",
        "photoURL": "",
        "source": "internal",
        "sourceId": "8da06331-5f56-4951-b126-f057e8709bad",
        "orgUnitId": null,
        "roles": [
          {
            "id": "00000000-0000-0002-0000-000000000000",
            "name": "Authenticated Users",
            "permissionIds": [
              "4ce18e69-0df7-4799-9d69-baa01152dd95",
              "ac98c25f-09ab-43ff-bdbd-5a21499be6a3",
              "d2974d9b-e965-403b-86b4-d5e143be6349",
              "e204f8ca-718b-4a29-bea3-554a4551ed20",
              "fe2ea6f1-192a-423c-9ae0-acb9f5d2dc48",
              "b8ca1f22-1faa-4c23-bcc2-c0051df9bccf",
              "e5ce2fc4-9f38-4f52-8190-b770ed2074e6"
            ]
          },
          {
            "id": "4154bf84-d36e-4551-9734-4666f5b1e1c0",
            "name": "Data Stewards",
            "permissionIds": [
              "2c1f7e2e-3ff2-460f-95b4-fef8b6698ac1",
              "60ea27d1-5772-4e11-823d-92f88f927745",
              "6a54f495-bcd0-4474-be12-60e1454aec7e",
              "1f7bd3d4-1ec4-4a5b-8ff0-a3bf4fc4b8aa",
              "5f89bd45-899a-4c37-9f71-3da878ad247b",
              "45247ef8-68b9-4dab-a5d5-a23143503887",
              "7293dae6-9235-43ec-ae43-b90c0e89fdee",
              "a45132c8-a43b-41ac-bd83-c9eb0a83be00",
              "6f431941-e937-489b-b252-6f8dd3d4d57f",
              "769d99b6-32a1-4f61-b4c0-662e46e94766",
              "1b3380a8-a888-43f7-bf92-6410e1306c75",
              "1c2e3c8d-b96d-43c0-ac21-4a0481f523a5"
            ]
          }
        ],
        "permissions": [
          {
            "id": "1b3380a8-a888-43f7-bf92-6410e1306c75",
            "name": "Published Dataset Permission with Ownership Constraint",
            "resourceId": "b226cad0-a2a4-45ac-871e-7f63ac8afb3d",
            "resourceUri": "object/dataset/published",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "1e6ed77c-4558-4fd6-9d29-352ac59d44ff",
                "uri": "object/dataset/published/update",
                "name": "Update Published Dataset"
              },
              {
                "id": "2d36ba79-70e7-408d-b09b-62f394862749",
                "uri": "object/dataset/published/create",
                "name": "Create Published Dataset"
              },
              {
                "id": "6e210917-03ec-4134-b787-947e78491259",
                "uri": "object/dataset/published/read",
                "name": "Read Publish Dataset"
              },
              {
                "id": "a4bdb24a-4ba4-40a7-bb91-c3ecfd0a4fce",
                "uri": "object/dataset/published/delete",
                "name": "Delete Published Dataset"
              }
            ]
          },
          {
            "id": "1c2e3c8d-b96d-43c0-ac21-4a0481f523a5",
            "name": "Draft Dataset Permission with Ownership Constraint",
            "resourceId": "4b73034a-f9c1-4dbe-ab1b-1cb78308df61",
            "resourceUri": "object/dataset/draft",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "09fb2938-7dd4-454f-89d3-7651e741d6f5",
                "uri": "object/dataset/draft/update",
                "name": "Update Draft Dataset"
              },
              {
                "id": "123aa97c-2e65-42ef-ba09-0fbc971a3d96",
                "uri": "object/dataset/draft/delete",
                "name": "Delete Draft Dataset"
              },
              {
                "id": "53a9ff97-d853-415f-9fae-33f1de4c0b46",
                "uri": "object/dataset/draft/read",
                "name": "Read Draft Dataset"
              },
              {
                "id": "8907505c-f275-42e7-aacc-b4fffce7c642",
                "uri": "object/dataset/draft/create",
                "name": "Create Draft Dataset"
              }
            ]
          },
          {
            "id": "1f7bd3d4-1ec4-4a5b-8ff0-a3bf4fc4b8aa",
            "name": "View Published Distribution within Org Units",
            "resourceId": "0bb9288c-dfcd-4c1a-ae24-1915bd4b0773",
            "resourceUri": "object/distribution/published",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "a8eef19d-7ea9-453c-985c-db10dfb49416",
                "uri": "object/distribution/published/read",
                "name": "Read Published Distribution"
              }
            ]
          },
          {
            "id": "2c1f7e2e-3ff2-460f-95b4-fef8b6698ac1",
            "name": "Read / invoke FaaS functions",
            "resourceId": "ef870309-c98c-48e6-ba85-3e556a2a6178",
            "resourceUri": "object/faas/function",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "109247a6-6388-4076-b1cf-f5518c2cb30f",
                "uri": "object/faas/function/read",
                "name": "Read any information of a FaaS function"
              },
              {
                "id": "8438c912-aee9-41d2-b600-06ab12667918",
                "uri": "object/faas/function/invoke",
                "name": "Invoke a FaaS function"
              }
            ]
          },
          {
            "id": "45247ef8-68b9-4dab-a5d5-a23143503887",
            "name": "View Published Datasets within Org Units",
            "resourceId": "b226cad0-a2a4-45ac-871e-7f63ac8afb3d",
            "resourceUri": "object/dataset/published",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "6e210917-03ec-4134-b787-947e78491259",
                "uri": "object/dataset/published/read",
                "name": "Read Publish Dataset"
              }
            ]
          },
          {
            "id": "4ce18e69-0df7-4799-9d69-baa01152dd95",
            "name": "Update own credential",
            "resourceId": "609db0f6-f021-411d-ba07-f47ad3e385fd",
            "resourceUri": "authObject/credential",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "9efa4e87-fb0c-4e4d-bab5-c6fd9b55cd8f",
                "uri": "authObject/credential/update",
                "name": "Update Credentials"
              }
            ]
          },
          {
            "id": "5f89bd45-899a-4c37-9f71-3da878ad247b",
            "name": "View Draft Distribution within Org Units",
            "resourceId": "bd6ca9ea-43a6-4ed5-8be7-5025b4e8d36a",
            "resourceUri": "object/distribution/draft",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "de247c3f-9012-4b87-80db-be9d1cb791d5",
                "uri": "object/distribution/draft/read",
                "name": "Read Draft Distribution"
              }
            ]
          },
          {
            "id": "60ea27d1-5772-4e11-823d-92f88f927745",
            "name": "Read Org Units with own org units",
            "resourceId": "85ad4109-5d16-452b-a2dc-ff695aa85b60",
            "resourceUri": "authObject/orgUnit",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "6d444cd6-16c7-44ca-bf2d-975f3baebbe3",
                "uri": "authObject/orgUnit/read",
                "name": "Read Organization Unit"
              }
            ]
          },
          {
            "id": "6a54f495-bcd0-4474-be12-60e1454aec7e",
            "name": "View Orgnisation (Publisher) within Org Units",
            "resourceId": "4dbcab94-8de3-4e49-abdc-679642b2a936",
            "resourceUri": "object/organization",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "94331a4d-873b-4454-8493-0f15c5dfb40d",
                "uri": "object/organization/read",
                "name": "Read Organization Record"
              }
            ]
          },
          {
            "id": "6f431941-e937-489b-b252-6f8dd3d4d57f",
            "name": "Published Distribution Permission with Ownership Constraint",
            "resourceId": "0bb9288c-dfcd-4c1a-ae24-1915bd4b0773",
            "resourceUri": "object/distribution/published",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "1dc51b0e-ca95-4a91-bd16-2f7c622e3ebd",
                "uri": "object/distribution/published/create",
                "name": "Create Published Distribution"
              },
              {
                "id": "a8eef19d-7ea9-453c-985c-db10dfb49416",
                "uri": "object/distribution/published/read",
                "name": "Read Published Distribution"
              },
              {
                "id": "e31c717a-0a47-4e31-8e28-5e5d6806757b",
                "uri": "object/distribution/published/delete",
                "name": "Delete Published Distribution"
              },
              {
                "id": "f9144799-ee7e-4625-9ee7-875c9467c42f",
                "uri": "object/distribution/published/update",
                "name": "Update Published Distribution"
              }
            ]
          },
          {
            "id": "7293dae6-9235-43ec-ae43-b90c0e89fdee",
            "name": "View Draft Datasets within Org Units",
            "resourceId": "4b73034a-f9c1-4dbe-ab1b-1cb78308df61",
            "resourceUri": "object/dataset/draft",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "53a9ff97-d853-415f-9fae-33f1de4c0b46",
                "uri": "object/dataset/draft/read",
                "name": "Read Draft Dataset"
              }
            ]
          },
          {
            "id": "769d99b6-32a1-4f61-b4c0-662e46e94766",
            "name": "Draft Distribution Permission with Ownership Constraint",
            "resourceId": "bd6ca9ea-43a6-4ed5-8be7-5025b4e8d36a",
            "resourceUri": "object/distribution/draft",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "1c7c37d8-97e5-4d5e-9b21-4de8a7e4924c",
                "uri": "object/distribution/draft/update",
                "name": "Update Draft Distribution"
              },
              {
                "id": "28d21042-5980-4bc0-9292-5dde9a74c0cc",
                "uri": "object/distribution/draft/create",
                "name": "Create Draft Distribution"
              },
              {
                "id": "7cb86119-f99c-4c52-a907-d75dcc697efe",
                "uri": "object/distribution/draft/delete",
                "name": "Delete Draft Distribution"
              },
              {
                "id": "de247c3f-9012-4b87-80db-be9d1cb791d5",
                "uri": "object/distribution/draft/read",
                "name": "Read Draft Distribution"
              }
            ]
          },
          {
            "id": "a45132c8-a43b-41ac-bd83-c9eb0a83be00",
            "name": "Orgnisation (Publisher) Permission within Ownership Constraint",
            "resourceId": "4dbcab94-8de3-4e49-abdc-679642b2a936",
            "resourceUri": "object/organization",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "94331a4d-873b-4454-8493-0f15c5dfb40d",
                "uri": "object/organization/read",
                "name": "Read Organization Record"
              },
              {
                "id": "ecc2e046-ed0e-433f-806a-d1f9ad6ce39a",
                "uri": "object/organization/create",
                "name": "Create Organization Record"
              }
            ]
          },
          {
            "id": "ac98c25f-09ab-43ff-bdbd-5a21499be6a3",
            "name": "Manage own API keys",
            "resourceId": "6ee09044-eb64-43e6-a4c0-eab4fd79df62",
            "resourceUri": "authObject/apiKey",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "14642045-b23c-47c5-b59c-0e4e823971a8",
                "uri": "authObject/apiKey/read",
                "name": "Read API key"
              },
              {
                "id": "18c4591a-ac53-4523-986f-6bb5bb4c5015",
                "uri": "authObject/apiKey/create",
                "name": "Create API key"
              },
              {
                "id": "c1fbbfef-c685-48ed-9d06-0b1fffa976e7",
                "uri": "authObject/apiKey/update",
                "name": "Update API key"
              },
              {
                "id": "cb855842-54ea-4f20-b4b7-6aabacb11354",
                "uri": "authObject/apiKey/delete",
                "name": "Delete API key"
              }
            ]
          },
          {
            "id": "b8ca1f22-1faa-4c23-bcc2-c0051df9bccf",
            "name": "Read Org Units with own org units",
            "resourceId": "85ad4109-5d16-452b-a2dc-ff695aa85b60",
            "resourceUri": "authObject/orgUnit",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "6d444cd6-16c7-44ca-bf2d-975f3baebbe3",
                "uri": "authObject/orgUnit/read",
                "name": "Read Organization Unit"
              }
            ]
          },
          {
            "id": "d2974d9b-e965-403b-86b4-d5e143be6349",
            "name": "Read content objects",
            "resourceId": "b2c08eba-b408-4cbe-a9e2-777f9d7c0931",
            "resourceUri": "object/content",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "0b98f026-97b4-4ac5-b316-0faa3d50e204",
                "uri": "object/content/read",
                "name": "Read content objects"
              }
            ]
          },
          {
            "id": "e204f8ca-718b-4a29-bea3-554a4551ed20",
            "name": "Read Orgnisation (Publisher) with own org units",
            "resourceId": "4dbcab94-8de3-4e49-abdc-679642b2a936",
            "resourceUri": "object/organization",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": true,
            "operations": [
              {
                "id": "94331a4d-873b-4454-8493-0f15c5dfb40d",
                "uri": "object/organization/read",
                "name": "Read Organization Record"
              }
            ]
          },
          {
            "id": "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
            "name": "View Published Dataset (Org Unit Constraint)",
            "resourceId": "b226cad0-a2a4-45ac-871e-7f63ac8afb3d",
            "resourceUri": "object/dataset/published",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": true,
            "operations": [
              {
                "id": "6e210917-03ec-4134-b787-947e78491259",
                "uri": "object/dataset/published/read",
                "name": "Read Publish Dataset"
              }
            ]
          },
          {
            "id": "fe2ea6f1-192a-423c-9ae0-acb9f5d2dc48",
            "name": "Read Published Distribution with own org units",
            "resourceId": "0bb9288c-dfcd-4c1a-ae24-1915bd4b0773",
            "resourceUri": "object/distribution/published",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": true,
            "operations": [
              {
                "id": "a8eef19d-7ea9-453c-985c-db10dfb49416",
                "uri": "object/distribution/published/read",
                "name": "Read Published Distribution"
              }
            ]
          }
        ],
        "managingOrgUnitIds": [],
        "orgUnit": null
      },
      "timestamp": 1692684812027,
      "operationUri": "object/record/create",
      "resourceUri": "object/record"
    }
}

test_allow_data_steward_user_create_his_own_dataset {
    # data_steward only alow create dataset not record
    # "dcat-dataset-strings" is required
    allow with input as {
      "object": {
        "record": {
          "name": "",
          "lastUpdate": null,
          "sourceTag": "",
          "id": "40a390dc-d008-4765-9e84-28cacae49751",
          "publishing": {
            "state": "published"
          },
          "dcat-dataset-strings": {},
          "dataset-draft": {
            "data": "{}",
            "dataset": {
              "name": "test dataset"
            },
            "timestamp": "2022-04-11T12:52:24.278Z"
          },
          "tenantId": 0,
          "access-control": {
            "ownerId": "8f414dab-cc51-4b5b-b790-4271da4f75a9"
          }
        }
      },
      "user": {
        "id": "8f414dab-cc51-4b5b-b790-4271da4f75a9",
        "displayName": "Test dataStewardUser",
        "email": "dataStewward@test.com",
        "photoURL": "",
        "source": "internal",
        "sourceId": "8da06331-5f56-4951-b126-f057e8709bad",
        "orgUnitId": null,
        "roles": [
          {
            "id": "00000000-0000-0002-0000-000000000000",
            "name": "Authenticated Users",
            "permissionIds": [
              "4ce18e69-0df7-4799-9d69-baa01152dd95",
              "ac98c25f-09ab-43ff-bdbd-5a21499be6a3",
              "d2974d9b-e965-403b-86b4-d5e143be6349",
              "e204f8ca-718b-4a29-bea3-554a4551ed20",
              "fe2ea6f1-192a-423c-9ae0-acb9f5d2dc48",
              "b8ca1f22-1faa-4c23-bcc2-c0051df9bccf",
              "e5ce2fc4-9f38-4f52-8190-b770ed2074e6"
            ]
          },
          {
            "id": "4154bf84-d36e-4551-9734-4666f5b1e1c0",
            "name": "Data Stewards",
            "permissionIds": [
              "2c1f7e2e-3ff2-460f-95b4-fef8b6698ac1",
              "60ea27d1-5772-4e11-823d-92f88f927745",
              "6a54f495-bcd0-4474-be12-60e1454aec7e",
              "1f7bd3d4-1ec4-4a5b-8ff0-a3bf4fc4b8aa",
              "5f89bd45-899a-4c37-9f71-3da878ad247b",
              "45247ef8-68b9-4dab-a5d5-a23143503887",
              "7293dae6-9235-43ec-ae43-b90c0e89fdee",
              "a45132c8-a43b-41ac-bd83-c9eb0a83be00",
              "6f431941-e937-489b-b252-6f8dd3d4d57f",
              "769d99b6-32a1-4f61-b4c0-662e46e94766",
              "1b3380a8-a888-43f7-bf92-6410e1306c75",
              "1c2e3c8d-b96d-43c0-ac21-4a0481f523a5"
            ]
          }
        ],
        "permissions": [
          {
            "id": "1b3380a8-a888-43f7-bf92-6410e1306c75",
            "name": "Published Dataset Permission with Ownership Constraint",
            "resourceId": "b226cad0-a2a4-45ac-871e-7f63ac8afb3d",
            "resourceUri": "object/dataset/published",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "1e6ed77c-4558-4fd6-9d29-352ac59d44ff",
                "uri": "object/dataset/published/update",
                "name": "Update Published Dataset"
              },
              {
                "id": "2d36ba79-70e7-408d-b09b-62f394862749",
                "uri": "object/dataset/published/create",
                "name": "Create Published Dataset"
              },
              {
                "id": "6e210917-03ec-4134-b787-947e78491259",
                "uri": "object/dataset/published/read",
                "name": "Read Publish Dataset"
              },
              {
                "id": "a4bdb24a-4ba4-40a7-bb91-c3ecfd0a4fce",
                "uri": "object/dataset/published/delete",
                "name": "Delete Published Dataset"
              }
            ]
          },
          {
            "id": "1c2e3c8d-b96d-43c0-ac21-4a0481f523a5",
            "name": "Draft Dataset Permission with Ownership Constraint",
            "resourceId": "4b73034a-f9c1-4dbe-ab1b-1cb78308df61",
            "resourceUri": "object/dataset/draft",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "09fb2938-7dd4-454f-89d3-7651e741d6f5",
                "uri": "object/dataset/draft/update",
                "name": "Update Draft Dataset"
              },
              {
                "id": "123aa97c-2e65-42ef-ba09-0fbc971a3d96",
                "uri": "object/dataset/draft/delete",
                "name": "Delete Draft Dataset"
              },
              {
                "id": "53a9ff97-d853-415f-9fae-33f1de4c0b46",
                "uri": "object/dataset/draft/read",
                "name": "Read Draft Dataset"
              },
              {
                "id": "8907505c-f275-42e7-aacc-b4fffce7c642",
                "uri": "object/dataset/draft/create",
                "name": "Create Draft Dataset"
              }
            ]
          },
          {
            "id": "1f7bd3d4-1ec4-4a5b-8ff0-a3bf4fc4b8aa",
            "name": "View Published Distribution within Org Units",
            "resourceId": "0bb9288c-dfcd-4c1a-ae24-1915bd4b0773",
            "resourceUri": "object/distribution/published",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "a8eef19d-7ea9-453c-985c-db10dfb49416",
                "uri": "object/distribution/published/read",
                "name": "Read Published Distribution"
              }
            ]
          },
          {
            "id": "2c1f7e2e-3ff2-460f-95b4-fef8b6698ac1",
            "name": "Read / invoke FaaS functions",
            "resourceId": "ef870309-c98c-48e6-ba85-3e556a2a6178",
            "resourceUri": "object/faas/function",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "109247a6-6388-4076-b1cf-f5518c2cb30f",
                "uri": "object/faas/function/read",
                "name": "Read any information of a FaaS function"
              },
              {
                "id": "8438c912-aee9-41d2-b600-06ab12667918",
                "uri": "object/faas/function/invoke",
                "name": "Invoke a FaaS function"
              }
            ]
          },
          {
            "id": "45247ef8-68b9-4dab-a5d5-a23143503887",
            "name": "View Published Datasets within Org Units",
            "resourceId": "b226cad0-a2a4-45ac-871e-7f63ac8afb3d",
            "resourceUri": "object/dataset/published",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "6e210917-03ec-4134-b787-947e78491259",
                "uri": "object/dataset/published/read",
                "name": "Read Publish Dataset"
              }
            ]
          },
          {
            "id": "4ce18e69-0df7-4799-9d69-baa01152dd95",
            "name": "Update own credential",
            "resourceId": "609db0f6-f021-411d-ba07-f47ad3e385fd",
            "resourceUri": "authObject/credential",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "9efa4e87-fb0c-4e4d-bab5-c6fd9b55cd8f",
                "uri": "authObject/credential/update",
                "name": "Update Credentials"
              }
            ]
          },
          {
            "id": "5f89bd45-899a-4c37-9f71-3da878ad247b",
            "name": "View Draft Distribution within Org Units",
            "resourceId": "bd6ca9ea-43a6-4ed5-8be7-5025b4e8d36a",
            "resourceUri": "object/distribution/draft",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "de247c3f-9012-4b87-80db-be9d1cb791d5",
                "uri": "object/distribution/draft/read",
                "name": "Read Draft Distribution"
              }
            ]
          },
          {
            "id": "60ea27d1-5772-4e11-823d-92f88f927745",
            "name": "Read Org Units with own org units",
            "resourceId": "85ad4109-5d16-452b-a2dc-ff695aa85b60",
            "resourceUri": "authObject/orgUnit",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "6d444cd6-16c7-44ca-bf2d-975f3baebbe3",
                "uri": "authObject/orgUnit/read",
                "name": "Read Organization Unit"
              }
            ]
          },
          {
            "id": "6a54f495-bcd0-4474-be12-60e1454aec7e",
            "name": "View Orgnisation (Publisher) within Org Units",
            "resourceId": "4dbcab94-8de3-4e49-abdc-679642b2a936",
            "resourceUri": "object/organization",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "94331a4d-873b-4454-8493-0f15c5dfb40d",
                "uri": "object/organization/read",
                "name": "Read Organization Record"
              }
            ]
          },
          {
            "id": "6f431941-e937-489b-b252-6f8dd3d4d57f",
            "name": "Published Distribution Permission with Ownership Constraint",
            "resourceId": "0bb9288c-dfcd-4c1a-ae24-1915bd4b0773",
            "resourceUri": "object/distribution/published",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "1dc51b0e-ca95-4a91-bd16-2f7c622e3ebd",
                "uri": "object/distribution/published/create",
                "name": "Create Published Distribution"
              },
              {
                "id": "a8eef19d-7ea9-453c-985c-db10dfb49416",
                "uri": "object/distribution/published/read",
                "name": "Read Published Distribution"
              },
              {
                "id": "e31c717a-0a47-4e31-8e28-5e5d6806757b",
                "uri": "object/distribution/published/delete",
                "name": "Delete Published Distribution"
              },
              {
                "id": "f9144799-ee7e-4625-9ee7-875c9467c42f",
                "uri": "object/distribution/published/update",
                "name": "Update Published Distribution"
              }
            ]
          },
          {
            "id": "7293dae6-9235-43ec-ae43-b90c0e89fdee",
            "name": "View Draft Datasets within Org Units",
            "resourceId": "4b73034a-f9c1-4dbe-ab1b-1cb78308df61",
            "resourceUri": "object/dataset/draft",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "53a9ff97-d853-415f-9fae-33f1de4c0b46",
                "uri": "object/dataset/draft/read",
                "name": "Read Draft Dataset"
              }
            ]
          },
          {
            "id": "769d99b6-32a1-4f61-b4c0-662e46e94766",
            "name": "Draft Distribution Permission with Ownership Constraint",
            "resourceId": "bd6ca9ea-43a6-4ed5-8be7-5025b4e8d36a",
            "resourceUri": "object/distribution/draft",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "1c7c37d8-97e5-4d5e-9b21-4de8a7e4924c",
                "uri": "object/distribution/draft/update",
                "name": "Update Draft Distribution"
              },
              {
                "id": "28d21042-5980-4bc0-9292-5dde9a74c0cc",
                "uri": "object/distribution/draft/create",
                "name": "Create Draft Distribution"
              },
              {
                "id": "7cb86119-f99c-4c52-a907-d75dcc697efe",
                "uri": "object/distribution/draft/delete",
                "name": "Delete Draft Distribution"
              },
              {
                "id": "de247c3f-9012-4b87-80db-be9d1cb791d5",
                "uri": "object/distribution/draft/read",
                "name": "Read Draft Distribution"
              }
            ]
          },
          {
            "id": "a45132c8-a43b-41ac-bd83-c9eb0a83be00",
            "name": "Orgnisation (Publisher) Permission within Ownership Constraint",
            "resourceId": "4dbcab94-8de3-4e49-abdc-679642b2a936",
            "resourceUri": "object/organization",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "94331a4d-873b-4454-8493-0f15c5dfb40d",
                "uri": "object/organization/read",
                "name": "Read Organization Record"
              },
              {
                "id": "ecc2e046-ed0e-433f-806a-d1f9ad6ce39a",
                "uri": "object/organization/create",
                "name": "Create Organization Record"
              }
            ]
          },
          {
            "id": "ac98c25f-09ab-43ff-bdbd-5a21499be6a3",
            "name": "Manage own API keys",
            "resourceId": "6ee09044-eb64-43e6-a4c0-eab4fd79df62",
            "resourceUri": "authObject/apiKey",
            "userOwnershipConstraint": true,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "14642045-b23c-47c5-b59c-0e4e823971a8",
                "uri": "authObject/apiKey/read",
                "name": "Read API key"
              },
              {
                "id": "18c4591a-ac53-4523-986f-6bb5bb4c5015",
                "uri": "authObject/apiKey/create",
                "name": "Create API key"
              },
              {
                "id": "c1fbbfef-c685-48ed-9d06-0b1fffa976e7",
                "uri": "authObject/apiKey/update",
                "name": "Update API key"
              },
              {
                "id": "cb855842-54ea-4f20-b4b7-6aabacb11354",
                "uri": "authObject/apiKey/delete",
                "name": "Delete API key"
              }
            ]
          },
          {
            "id": "b8ca1f22-1faa-4c23-bcc2-c0051df9bccf",
            "name": "Read Org Units with own org units",
            "resourceId": "85ad4109-5d16-452b-a2dc-ff695aa85b60",
            "resourceUri": "authObject/orgUnit",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "6d444cd6-16c7-44ca-bf2d-975f3baebbe3",
                "uri": "authObject/orgUnit/read",
                "name": "Read Organization Unit"
              }
            ]
          },
          {
            "id": "d2974d9b-e965-403b-86b4-d5e143be6349",
            "name": "Read content objects",
            "resourceId": "b2c08eba-b408-4cbe-a9e2-777f9d7c0931",
            "resourceUri": "object/content",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": false,
            "preAuthorisedConstraint": false,
            "allowExemption": false,
            "operations": [
              {
                "id": "0b98f026-97b4-4ac5-b316-0faa3d50e204",
                "uri": "object/content/read",
                "name": "Read content objects"
              }
            ]
          },
          {
            "id": "e204f8ca-718b-4a29-bea3-554a4551ed20",
            "name": "Read Orgnisation (Publisher) with own org units",
            "resourceId": "4dbcab94-8de3-4e49-abdc-679642b2a936",
            "resourceUri": "object/organization",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": true,
            "operations": [
              {
                "id": "94331a4d-873b-4454-8493-0f15c5dfb40d",
                "uri": "object/organization/read",
                "name": "Read Organization Record"
              }
            ]
          },
          {
            "id": "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
            "name": "View Published Dataset (Org Unit Constraint)",
            "resourceId": "b226cad0-a2a4-45ac-871e-7f63ac8afb3d",
            "resourceUri": "object/dataset/published",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": true,
            "operations": [
              {
                "id": "6e210917-03ec-4134-b787-947e78491259",
                "uri": "object/dataset/published/read",
                "name": "Read Publish Dataset"
              }
            ]
          },
          {
            "id": "fe2ea6f1-192a-423c-9ae0-acb9f5d2dc48",
            "name": "Read Published Distribution with own org units",
            "resourceId": "0bb9288c-dfcd-4c1a-ae24-1915bd4b0773",
            "resourceUri": "object/distribution/published",
            "userOwnershipConstraint": false,
            "orgUnitOwnershipConstraint": true,
            "preAuthorisedConstraint": false,
            "allowExemption": true,
            "operations": [
              {
                "id": "a8eef19d-7ea9-453c-985c-db10dfb49416",
                "uri": "object/distribution/published/read",
                "name": "Read Published Distribution"
              }
            ]
          }
        ],
        "managingOrgUnitIds": [],
        "orgUnit": null
      },
      "timestamp": 1692684812027,
      "operationUri": "object/record/create",
      "resourceUri": "object/record"
    }
}