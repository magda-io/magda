# Access groups

An access group lets you share records, typically datasets and their files, with a chosen set of users,
whatever org units they belong to. Members get the access the group grants on every record in the group.

This guide is for MAGDA v8 (`next`). How it works internally: [access groups architecture](./architecture/access-groups.md).

## Who can do what

| You want to                                                   | You need                                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Create a group                                                | `object/accessGroup/create`                                                                           |
| See a group                                                   | `object/accessGroup/read` on it. Members have this for their own groups.                              |
| Rename it, manage or list its members, add or remove datasets | `object/accessGroup/update` on it. Adding a dataset also needs `object/record/update` on the dataset. |
| Delete it                                                     | `object/accessGroup/delete` on it                                                                     |

Administrators can do everything.

### Letting someone manage their own groups

Assign the stock role **Access Group Managers** (see [how to manage users, roles & permissions](https://www.npmjs.com/package/@magda/acs-cmd)).
Its holders can create groups and manage the groups they own: a new group is owned by its creator.

They can only add datasets, and their distributions, that they're allowed to update, for example a data steward's own datasets. They can narrow what their group grants, but not widen it: adding operations needs an administrator. Handing a group to another owner also needs an administrator.

For other scopes, create a permission on the `object/accessGroup` resource with the operations and constraint
you need. For example, an org unit constraint to manage the groups in the org units a user manages.

## Creating and managing a group

1. **Settings → Access Groups → Create.** Give it a name and choose what members can do with its records (e.g.
   read).
2. **Datasets tab → Add dataset.** This adds the dataset **and all its distributions**. To share only some of a
   dataset's files, ask an administrator to grant the group's permission on those records instead.
3. **Users tab → enter the user's ID → Add user to the group.** The tab lists the members. Only people who can
   manage the group see it.

## What members see

- Members can read the group's own record and the records in the group, with the operations the group grants.
- They can't see who else is in the group, change the group or delete it.
- When a group manager removes a member, the member loses the access the group granted.

## Notes for upgrading from v7

- Generic `object/record/*` permissions on a group record no longer let anyone read or manage the group. Grant
  `object/accessGroup/*` instead.
- Members of existing groups keep reading their groups. The upgrade converts their permission.
- Members can no longer list a group's members.
