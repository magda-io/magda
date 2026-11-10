# Access group management E2E

**Purpose:** check typed access group authorisation on a real cluster ([#3910](https://github.com/magda-io/magda/issues/3910),
[#3914](https://github.com/magda-io/magda/issues/3914)): a non-administrator manages their own group, a member
can't manage it or list its members, and group records can't be changed through Registry with constrained grants.

**Setup:**

- Deploy a `next` build including this change (OPA, authorization API, the authorization database migration and
  the web server). Record the image digests and commit under test.
- Create three disposable users through `/v0/public/users` with a short-lived admin JWT (see the
  [shared gateway and API key setup](../e2e-cluster-deployment-test.md#feature-specific-testing-through-the-gateway-with-an-api-key)),
  each with their own API key:
  - **Owen**, with Authenticated Users, Data Stewards and **Access Group Managers**;
  - **Mia**, with Authenticated Users only;
  - an administrator.
- Owen creates a published dataset he owns.
- Clean up afterwards: the group, the dataset and the users.

## Steps and expected results

| #   | Actor         | Step                                                                                                    | Expected                                                                       |
| --- | ------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Owen          | `POST /v0/auth/accessGroups` with `ownerId` omitted                                                     | 200; the group's `ownerId` is Owen                                             |
| 2   | Owen          | the same, with another user's `ownerId`                                                                 | 403                                                                            |
| 3   | Owen          | Settings → Access Groups                                                                                | his group is listed and opens; General Info, Datasets and Users tabs are shown |
| 4   | Owen          | add his dataset; add Mia as a member                                                                    | 200 each; the Users tab lists Mia                                              |
| 5   | Mia           | read the group record (Registry `GET /records/:groupId?aspect=access-group-details`)                    | 200                                                                            |
| 6   | Mia           | read Owen's dataset                                                                                     | allowed, as the group grants                                                   |
| 7   | Mia           | `GET /v0/auth/accessGroups/:groupId/users` and `/users/count`                                           | 403                                                                            |
| 8   | Mia           | `PUT /v0/auth/accessGroups/:groupId`, `POST .../users/:userId`, `DELETE /v0/auth/accessGroups/:groupId` | 403                                                                            |
| 9   | Mia           | the group's page in the UI                                                                              | no Users tab; `/users` shows General Info                                      |
| 10  | Owen          | Registry `PUT /records/:groupId/aspects/access-group-details` changing `roleId`                         | 403; the group record is unchanged                                             |
| 11  | Owen          | Registry create of a published dataset he owns that also carries an `access-group-details` aspect       | 403                                                                            |
| 12  | Owen          | remove Mia; `GET .../users`                                                                             | 200; Mia is no longer listed and can no longer read the dataset                |
| 13  | Administrator | everything above                                                                                        | allowed, as before                                                             |
| 14  | Owen          | delete the group                                                                                        | 200                                                                            |

**Upgrade check (optional):** on a v7 database with an existing group and member, apply the migration. The member
still reads the group record, `object/accessGroup/read` is no longer granted unconstrained to member roles, and
"Access Group Managers" exists, unassigned.

## Results

Record expected, observed and not-yet-tested results per step, with the build under test.
