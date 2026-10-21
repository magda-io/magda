package storage.object

import data.common.breakdownOperationUri
import data.common.hasNoConstraintPermission
import data.common.hasOrgUnitConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.isEmpty

default allow = false

# Installation records (#3861) have no Storage object of their own: no object
# may be linked to one, so their typed record permissions never reach Storage.
linkedRecordBindingValid {
	not input.object.record["agent-skill"]
	not input.object.record["agent-skill-installation"]
}

linkedRecordBindingValid {
	input.object.record["agent-skill"]
	input.storage.object.name = input.object.record["agent-skill"].archiveKey
	input.storage.object.ownerId = input.object.record["access-control"].ownerId
}

protectedAgentSkillArchive {
	startswith(input.storage.object.name, "agent-services/skills/system-skills/")
}

protectedAgentSkillArchive {
	startswith(input.storage.object.name, "agent-services/skills/user-skills/")
}

protectedAgentSkillRead {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType == "read"
	protectedAgentSkillArchive
}

genericStoragePermissionApplies {
	not protectedAgentSkillRead
}

# Users has a unlimited permission to perform the operation on storage object will be allowed
allow {
	genericStoragePermissionApplies
	hasNoConstraintPermission(input.operationUri)
}

# Rules for permissions with ownership constraint
# i.e. only owner of the storage object (file) can perform the operation
allow {
	genericStoragePermissionApplies
	hasOwnerConstraintPermission(input.operationUri)

	# storage object metadata ownerId should match current user's id
	input.storage.object.ownerId = input.user.id
}

# Rules for permissions with org unit constraint
allow {
	genericStoragePermissionApplies
	hasOrgUnitConstraintPermission(input.operationUri)

	# storage object metadata orgUnitId should match current user's managingOrgUnitIds
	input.user.managingOrgUnitIds[_] = input.storage.object.orgUnitId
}

# or when a user has org unit ownership constraint permission, he also can access (read only) all objects with NO org unit assigned
allow {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType == "read"
	genericStoragePermissionApplies
	hasOrgUnitConstraintPermission(input.operationUri)
	not input.storage.object.orgUnitId
}

# or when a user has org unit ownership constraint permission, he also can access (read only) all objects with NO org unit assigned
allow {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType == "read"
	genericStoragePermissionApplies
	hasOrgUnitConstraintPermission(input.operationUri)
	isEmpty(input.storage.object.orgUnitId)
}

# Ordinary linked objects retain the existing record-read authorization path.
allow {
	not protectedAgentSkillArchive
	input.storage.object.recordId = input.object.record.id
	linkedRecordBindingValid
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType = "read"
	data.object.record.verifyPermission("object/record/read")
}

# Reads from the reserved Agent Skill archive namespace never fall back to
# generic Storage permissions. The object must exist and be linked to a complete,
# deterministic Agent Skill publication whose typed source-read policy allows the
# real caller. Trusted global administrators, including the default administrator
# used for internal lifecycle inspection, remain covered by the existing top-level
# entrypoint override; they are not granted here through a Storage permission.
allow {
	protectedAgentSkillRead
	input.storage.object.exists == true
	input.storage.object.recordId = input.object.record.id
	publicationType := data.object.agentSkill.recordPublicationType("record")
	data.object.agentSkill.validPublicationIdentity("record", publicationType)
	linkedRecordBindingValid
	data.object.record.verifyPermission("object/record/read")
}

# A linked upload of a new object follows record create. Replacing an existing
# object follows record update. Storage API supplies this trusted existence bit
# from its pre-upload object-store stat, not from caller metadata.
# Keeping these cases separate prevents create-only grants overwriting archives.
allow {
	input.storage.object.recordId = input.object.record.id
	linkedRecordBindingValid
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType = "upload"
	input.storage.object.exists == false
	data.object.record.verifyPermission("object/record/create")
}

allow {
	input.storage.object.recordId = input.object.record.id
	linkedRecordBindingValid
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType = "upload"
	input.storage.object.exists == true
	data.object.record.verifyPermission("object/record/update")
}

# Deleting an existing linked object requires the corresponding record delete;
# create/update grants cannot be promoted to destructive Storage authority.
allow {
	input.storage.object.recordId = input.object.record.id
	linkedRecordBindingValid
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType = "delete"
	data.object.record.verifyPermission("object/record/delete")
}
