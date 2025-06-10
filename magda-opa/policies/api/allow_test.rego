package api

import rego.v1

test_api_allow_case_1 if {
	allow with input as {
		"operationUri": "api/my-api/records/ea5d2d58-165a-48cb-9b22-42edd6a3024a/POST",
		"user": {
			"displayName": "xxxxxx",
			"email": "xxx@xxx.com",
			"id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
			"permissions": [{
				"id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
				"name": "API create a new record",
				"operations": [
					{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "POST",
						"uri": "api/my-api/records/*/POST",
					},
					{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "OPTION",
						"uri": "api/my-api/records/*/OPTION",
					},
				],
				"orgUnitOwnershipConstraint": false,
				"preAuthorisedConstraint": false,
				"resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
				"resourceUri": "api/my-api/records/*",
				"userOwnershipConstraint": false,
				"allowExemption": false,
			}],
			"roles": [{
				"id": "a1f7b415-dba6-4717-bfe5-79cd10ea903f ",
				"name": "test API role",
				"permissionIds": ["72d52505-cf96-47b2-9b74-d0fdc1f5aee7"],
			}],
		},
	}
}

test_api_allow_case_2 if {
	allow with input as {
		"operationUri": "api/my-api/records/ea5d2d58-165a-48cb-9b22-42edd6a3024a/OPTION",
		"user": {
			"displayName": "xxxxxx",
			"email": "xxx@xxx.com",
			"id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
			"permissions": [{
				"id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
				"name": "API create a new record",
				"operations": [
					{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "POST",
						"uri": "api/my-api/records/*/POST",
					},
					{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "OPTION",
						"uri": "api/my-api/records/*/OPTION",
					},
				],
				"orgUnitOwnershipConstraint": false,
				"preAuthorisedConstraint": false,
				"resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
				"resourceUri": "api/my-api/records/*",
				"userOwnershipConstraint": false,
				"allowExemption": false,
			}],
			"roles": [{
				"id": "a1f7b415-dba6-4717-bfe5-79cd10ea903f ",
				"name": "test API role",
				"permissionIds": ["72d52505-cf96-47b2-9b74-d0fdc1f5aee7"],
			}],
		},
	}
}

test_api_allow_case_3 if {
	not allow with input as {
		"operationUri": "api/my-api/records/ea5d2d58-165a-48cb-9b22-42edd6a3024a/GET",
		"user": {
			"displayName": "xxxxxx",
			"email": "xxx@xxx.com",
			"id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
			"permissions": [{
				"id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
				"name": "API create a new record",
				"operations": [
					{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "POST",
						"uri": "api/my-api/records/*/POST",
					},
					{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "OPTION",
						"uri": "api/my-api/records/*/OPTION",
					},
				],
				"orgUnitOwnershipConstraint": false,
				"preAuthorisedConstraint": false,
				"resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
				"resourceUri": "api/my-api/records/*",
				"userOwnershipConstraint": false,
				"allowExemption": false,
			}],
			"roles": [{
				"id": "a1f7b415-dba6-4717-bfe5-79cd10ea903f ",
				"name": "test API role",
				"permissionIds": ["72d52505-cf96-47b2-9b74-d0fdc1f5aee7"],
			}],
		},
	}
}

test_api_allow_case_4 if {
	allow with input as {
		"operationUri": "api/my-api/endpoint1/PUT",
		"user": {
			"displayName": "xxxxxx",
			"email": "xxx@xxx.com",
			"id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
			"permissions": [{
				"id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
				"name": "API trigger endpoint1",
				"operations": [
					{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "PUT",
						"uri": "api/my-api/endpoint1/PUT",
					},
					{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "OPTION",
						"uri": "api/my-api/endpoint1/OPTION",
					},
				],
				"orgUnitOwnershipConstraint": false,
				"preAuthorisedConstraint": false,
				"resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
				"resourceUri": "api/my-api/records/*",
				"userOwnershipConstraint": false,
				"allowExemption": false,
			}],
			"roles": [{
				"id": "a1f7b415-dba6-4717-bfe5-79cd10ea903f ",
				"name": "test API role",
				"permissionIds": ["72d52505-cf96-47b2-9b74-d0fdc1f5aee7"],
			}],
		},
	}
}

test_api_allow_case_5 if {
	not allow with input as {
		"operationUri": "api/my-api/*/PUT",
		"user": {
			"displayName": "xxxxxx",
			"email": "xxx@xxx.com",
			"id": "80a9dce4-91af-44e2-a2f4-9ddccb3f4c5e",
			"permissions": [{
				"id": "72d52505-cf96-47b2-9b74-d0fdc1f5aee7",
				"name": "API trigger endpoint1",
				"operations": [
					{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "PUT",
						"uri": "api/my-api/endpoint1/PUT",
					},
					{
						"id": "bf946197-392a-4dbb-a7e1-789424e231a4",
						"name": "OPTION",
						"uri": "api/my-api/endpoint1/OPTION",
					},
				],
				"orgUnitOwnershipConstraint": false,
				"preAuthorisedConstraint": false,
				"resourceId": "ea5d2d58-165a-48cb-9b22-42edd6a3024a",
				"resourceUri": "api/my-api/records/*",
				"userOwnershipConstraint": false,
				"allowExemption": false,
			}],
			"roles": [{
				"id": "a1f7b415-dba6-4717-bfe5-79cd10ea903f ",
				"name": "test API role",
				"permissionIds": ["72d52505-cf96-47b2-9b74-d0fdc1f5aee7"],
			}],
		},
	}
}
