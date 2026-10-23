package storage.object

import data.common.breakdownOperationUri
import data.common.hasNoConstraintPermission
import data.common.hasOrgUnitConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.isEmpty

default allow = false

# Objects outside the reserved Agent Skill archive namespace can be linked to
# any other record.
linkedRecordBindingValid {
	not protectedAgentSkillArchive
	not input.object.record["agent-skill"]
}

# An Agent Skill record is only linked to the object at its exact archive key.
# Only Agent Services (as an admin), admins and unconstrained grants can write
# objects in the reserved namespace (see below), so an archive's Storage owner
# is not part of the binding: Agent Services uploads archives with its internal
# session, and checks the archive's checksum against the record when serving it.
linkedRecordBindingValid {
	input.object.record["agent-skill"]
	input.storage.object.name = input.object.record["agent-skill"].archiveKey
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

# Agent Skill archives are written by Agent Services only (with its internal
# session), after it authorises the caller with the typed Agent Skill
# operations. So constrained (ownership or org unit) Storage permissions never
# apply in the reserved namespace; unconstrained Storage permissions (trusted
# grants) can still write there, but never read (see below).
constrainedStoragePermissionApplies {
	not protectedAgentSkillArchive
}

# Users has a unlimited permission to perform the operation on storage object will be allowed
allow {
	genericStoragePermissionApplies
	hasNoConstraintPermission(input.operationUri)
}

# Rules for permissions with ownership constraint
# i.e. only owner of the storage object (file) can perform the operation
allow {
	constrainedStoragePermissionApplies
	hasOwnerConstraintPermission(input.operationUri)

	# storage object metadata ownerId should match current user's id
	input.storage.object.ownerId = input.user.id
}

# Rules for permissions with org unit constraint
allow {
	constrainedStoragePermissionApplies
	hasOrgUnitConstraintPermission(input.operationUri)

	# storage object metadata orgUnitId should match current user's managingOrgUnitIds
	input.user.managingOrgUnitIds[_] = input.storage.object.orgUnitId
}

# or when a user has org unit ownership constraint permission, he also can access (read only) all objects with NO org unit assigned
allow {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType == "read"
	constrainedStoragePermissionApplies
	hasOrgUnitConstraintPermission(input.operationUri)
	not input.storage.object.orgUnitId
}

# or when a user has org unit ownership constraint permission, he also can access (read only) all objects with NO org unit assigned
allow {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType == "read"
	constrainedStoragePermissionApplies
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
# generic Storage permissions. The object must exist and be linked to an Agent
# Skill publication (whose archive key matches the object) that the real caller
# can read. Agent Services validates the publication's deterministic identity
# before writing it, and the archive before exposing it. Trusted global
# administrators, including the default administrator used for internal
# lifecycle inspection, remain covered by the existing top-level entrypoint
# override; they are not granted here through a Storage permission.
allow {
	protectedAgentSkillRead
	input.storage.object.exists == true
	input.storage.object.recordId = input.object.record.id
	data.object.agentSkill.recordPublicationType("record")
	linkedRecordBindingValid
	data.object.record.verifyPermission("object/record/read")
}

# Writes to a linked object require the corresponding operation on the linked
# record. For an Agent Skill record, generic record writes are limited to admins
# and unconstrained grants (see `object/record/allow.rego`), so typed Agent
# Skill grants alone can't write its archive: Agent Services does.
linkedRecordWritePermission(operationType) {
	data.object.record.verifyPermission(concat("/", ["object/record", operationType]))
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
	linkedRecordWritePermission("create")
}

allow {
	input.storage.object.recordId = input.object.record.id
	linkedRecordBindingValid
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType = "upload"
	input.storage.object.exists == true
	linkedRecordWritePermission("update")
}

# Deleting an existing linked object requires the corresponding record delete;
# create/update grants cannot be promoted to destructive Storage authority.
allow {
	input.storage.object.recordId = input.object.record.id
	linkedRecordBindingValid
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType = "delete"
	linkedRecordWritePermission("delete")
}
