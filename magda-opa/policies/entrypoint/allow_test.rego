package entrypoint

import rego.v1

test_allow_non_admin_should_have_no_permission_to_not_defined_resource if {
	not allow with input as {
		"operationUri": "object/test-any-object/test-any-operation",
		"user": {
			"displayName": "Jacky Jiang",
			"email": "jacky.jiang@data61.csiro.au",
			"id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
			"permissions": [
				{
					"id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
					"name": "View Draft Dataset (Own)",
					"operations": [{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "Read Draft Dataset",
						"uri": "object/dataset/draft/read",
					}],
					"orgUnitOwnershipConstraint": false,
					"preAuthorisedConstraint": false,
					"resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
					"resourceUri": "object/dataset/draft",
					"userOwnershipConstraint": true,
				},
				{
					"id": "e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
					"name": "View Published Dataset",
					"operations": [{
						"id": "f1e2af3e-5d98-4081-a4ff-7016f43002fa",
						"name": "Read Publish Dataset",
						"uri": "object/dataset/published/read",
					}],
					"orgUnitOwnershipConstraint": false,
					"preAuthorisedConstraint": false,
					"resourceId": "ef3b767f-d06b-46f4-9302-031ae5004275",
					"resourceUri": "object/dataset/published",
					"userOwnershipConstraint": false,
				},
			],
			"photoURL": "//www.gravatar.com/avatar/bed026a33c154abec6852b4e313bf1ce",
			"roles": [
				{
					"id": "00000000-0000-0002-0000-000000000000",
					"name": "Authenticated Users",
					"permissionIds": ["e5ce2fc4-9f38-4f52-8190-b770ed2074e6"],
				},
				{
					"id": "14ff3f57-e8ea-4771-93af-c6ea91a798d5",
					"name": "Approvers",
					"permissionIds": [
						"e5ce2fc4-9f38-4f52-8190-b770ed2074e6",
						"72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
					],
				},
			],
			"source": "ckan",
		},
	}
}

test_allow_admin_should_have_permission_to_not_defined_resource if {
	allow with input as {
		"operationUri": "object/test-any-object/test-any-operation",
		"user": {
			"displayName": "Jacky Jiang",
			"email": "jacky.jiang@data61.csiro.au",
			"id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
			"permissions": [],
			"photoURL": "//www.gravatar.com/avatar/bed026a33c154abec6852b4e313bf1ce",
			"roles": [{
				"id": "00000000-0000-0003-0000-000000000000",
				"name": "Admin Users",
				"permissionIds": [],
			}],
			"source": "ckan",
		},
	}
}
