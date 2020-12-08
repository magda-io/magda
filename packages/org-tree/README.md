## MAGDA org-tree Utility

A set of tools for managing Magda organizational hierarchy. You might also want to have a look at [acs-cmd](https://www.npmjs.com/package/@magda/acs-cmd) utility.

### Install

```
$ npm install --global @magda/org-tree
```

### Upgrade

To update the existing installation to the latest version:

```
$ npm install --global @magda/org-tree@latest
```

### Usage

Run without any options will show the help information:

```
$ org-tree

Usage: org-tree [options] [command]

A tool for managing magda authentication & access control data. Version: x.x.x

If a database connection is required, the following environment variables will be used to create a connection:
  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.
  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.
  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.
  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.

Options:
  -V, --version                             output the version number
  -h, --help                                output usage information

Commands:
  view
        Display the entire tree in text .

  create <rootNodeName>
        Create a root tree node with specified name.

  insert <parentNodeNameOrId> <nodeName>
        Insert a node as a child node of the specified the parent node with specified name.
        If the parent node name is given instead of the parent node Id, the newly created child node will be inserted to the first located parent node.

  delete <nodeNameOrId>
        Delete the node specified and all its dependents from the tree.
        If the node name is given instead of the node Id, the first located node (and its dependents) will be removed.

  move <nodeNameOrId> <parentNodeNameOrId>
        Move the node specified and all its dependents to the specified parent node.
        If the node name is given instead of the node Id, the first located node (and its dependents) will be moved.
        If the parent node name is given instead of the parent node Id, the specifed node will be moved to the first located parent node.

  assign <userNameOrId> <nodeNameOrId>
        Assign the specified user to the nominated node.
        Both `userNameOrId` & `nodeNameOrId` can be either entity name or Id.
        If more than one entities are located by entity name, the first one will be used.
  unassign <userNameOrId>
        Assign the specified user from any node
  help [cmd]                                display help for [cmd]
```

> You will need to port forward the Magda database to localhost to make sure the utility can connect to your Magda database.

-   To do so, You can run `kubectl port-forward combined-db-0 5432`.
    -   If you didn't install magda to the default namespace, you can use: `kubectl port-forward -n [namespace] combined-db-0 5432`

#### Example

View organisation unit hierarchy tree:

```
$ org-tree view

└─ Department A
   ├─ Branch A
   └─ Branch B

```
