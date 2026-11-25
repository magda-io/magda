# LLM access profiles: Settings UI

**Status:** proposed screens for [#3838](https://github.com/magda-io/magda/issues/3838). **Not implemented.** This document covers screens and interactions only. Rules and APIs are in the [design](./llm-access-profiles.md), and the requirement numbers (e.g. **AUTH-7**) refer to it.

Follow the existing Settings conventions (Access Groups, Roles, Users) for navigation, data grids, pop-ups and accessibility. Hidden tabs and disabled buttons are only a convenience; the API enforces every rule.

## Navigation

**Settings → LLM Services** has three tabs:

| Tab | Shown to | Purpose |
| --- | --- | --- |
| **Access Profiles** | Holders of `llm/access/read` (AUTH-3), and administrators | List, create and manage profiles |
| **My Usage** | Any user holding a permission that includes `llm/access/invoke`, of any constraint, and administrators. This is a frontend check on the user's permissions; no OPA call is needed | The user's own usage and remaining quota |
| **User Usage** | Holders of `llm/usage/read` (AUTH-9), and administrators | Other users' usage |

The LLM Services menu entry is shown when at least one tab is.

## Access Profiles

### List

| Column | Content |
| --- | --- |
| Name | Link to the profile |
| Models | Aliases, or **All available models (\*)** |
| Audience | Org unit name, **Public**, both, or **Roles only** |
| Daily / weekly / monthly limit | Compact; per user and per model (MODEL-3). Blank means unlimited |
| Status | Enabled / Disabled |

The list is server-side paginated with name search. A **Create profile** button is shown to holders of `llm/access/create`.

### Profile page: General

| Field | Control | Notes |
| --- | --- | --- |
| Name, description | Text | Name required |
| Models | Multi-select of available aliases (API-6), or the exclusive option **All available models (\*)** | Help: "New models the operator adds become available under \*" |
| Enabled | Switch | |
| Org unit (audience) | Searchable org unit picker, or **No org unit** | See the help text below |
| Public | Switch (`constraint_exemption`) | See the help text below |
| Daily, weekly, monthly limit | Optional non-negative whole numbers (tokens) | Help: "Per user and per model. Blank means no limit; 0 blocks new requests." |

**Org unit help text:** "Users in this org unit, or in any org unit below it, can use this profile if they hold an org-unit-scoped Use permission (included in the Agent Workspace Users role). Users in units above it don't get access. Example: a profile on *Finance* is available to people in *Finance* and *Finance › Payroll*, but not to people in *Corporate*, the unit above Finance."

**Public help text:** "Available to every user whose role grants public LLM access (exemption). The administrator decides which roles that is."

Saving sends the revision. A stale save shows "This profile was changed by someone else. Reload to see the changes." and keeps the unsaved form contents (DATA-4).

**Delete** asks for confirmation: "Delete profile *X*? Users will lose the access this profile gives, and it will be removed from N roles. Their usage history is kept." If the deletion fails, the profile is unchanged and an error says to retry (LIFE-4).

### Profile page: Roles with access

A grid of the roles that hold the profile's Use permission (API-3):

| Role | Description | Actions |
| --- | --- | --- |
| Name, with the ID as secondary text | Role description | **Remove** |

- **Add role** opens a pop-up with a searchable role picker (API-4) showing name, description and ID. Anonymous Users, Admin Users and roles already attached are not offered. Confirm text: "Everyone with role *R* will be able to use this profile."
- **Remove** asks for confirmation, then removes only this profile's access from that role. The role and its users are not changed.
- Note above the grid: "To give individual people access, add them to one of these roles in **Settings → Users**. People may also have access through the profile's org unit or the Public setting."
- The grid doesn't list users, and doesn't try to work out who effectively has access.
- If the profile's permission went missing (LIFE-5: its only role was deleted), the grid is simply empty; adding a role re-creates it. No repair action is needed.

## My Usage

The user's own data only. The user ID comes from the session, never from the page (API-7).

| Section | Content |
| --- | --- |
| Totals | Total (all time), Today, This week (Monday start), This month |
| Models | For each alias the user can use: remaining quota (USE-8) per period and overall, shown as a number, **Unlimited** or **Exhausted**; measured and estimated tokens shown separately |
| No access | When there's no eligible profile: "**No eligible model profile.** Ask your administrator for access." plus the configured help text or link (DEP-3) |
| Daily history | Paginated rows: date, model, measured input, measured output, estimated, total. Filter by model and date range |

Always show the accounting timezone (e.g. "Times are in Australia/Sydney"). Explain under Remaining: "Remaining is an estimate of when new requests will be refused. Requests already running can go over it."

## User Usage

Search a user by ID. Name and email search, and the names on result rows, work only when the viewer may read users; otherwise rows show IDs (API-12). Optional filters: model and date range.

For the selected user, show the same sections as My Usage. Add a note: "This usage may come from several profiles."

Responses are server-paginated. There is no quota-reset or export action.

## Agent Workspace: no model access

When the Workspace user has no eligible model (`GET /api/v0/llm/v1/models` returns no aliases), the Workspace shows before or alongside the session: "**No AI model access.** Your account can open the Agent Workspace but has no LLM access yet. Contact your administrator." plus the configured help text or link (DEP-3). The agent must not fail without explanation.

## States and accessibility

- Enabled and Disabled are shown as text, not colour alone.
- Loading, empty, `403`, `409`, `429` and `503` each have actionable text.
- Pop-ups have headings, keyboard access and focus return when they close. Search fields have labels.

## Acceptance cases

1. A user with only constrained `llm/access/*` permissions sees no Access Profiles tab, and is denied by the API even with a deep link (AUTH-3).
2. An LLM Profile Manager creates a profile with `*` and limits, then attaches a role; a user in that role can use it.
3. **Add role** doesn't offer Anonymous Users, Admin Users or roles already attached. **Remove** leaves the role, its users and any other profiles unchanged.
4. The Org unit help text's example matches the behaviour: a user in the profile's unit or a unit below has access; a user in a unit above or in a sibling unit doesn't. A profile with no org unit gives no org unit access.
5. Public plus the stock "Use LLM profiles" permission gives access to users with no org unit, profile role or other grant. Public without an exemption-capable grant gives nothing.
6. My Usage appears for a user with any invoke permission. When nothing is eligible it shows "No eligible model profile", not 0. It never shows another user's data, whatever the URL.
7. With two eligible profiles for a model, remaining is the larger of the two profiles' minimum remaining; Unlimited and Exhausted are shown distinctly.
8. User Usage is visible and usable only with `llm/usage/read`. Names appear only for viewers who may read users.
9. A stale profile save shows the reload message and keeps the form contents.
10. A Workspace user with no eligible model sees the no-access message.
