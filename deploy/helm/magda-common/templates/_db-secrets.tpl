{{/* vim: set filetype=mustache: */}}
{{/*
  Generating db client user password secret for a logic database.
  Parameters / Input: 
    Must passing the root scope as the template input.
    The logic db name will be retrieved via `.Chart.Name`
  Usage: 
  {{- include "magda.db-client-password-secret-creation" . }}
*/}}
{{- define "magda.db-client-password-secret-creation" }}
{{- /* only create when current chart is `combined-db` or the independent k8s db instance for the current chart (logic db) is on */}}
{{- if and .Values.autoCreateSecret (or (eq .Chart.Name "combined-db") ((get .Values.global.useInK8sDbInstance .Chart.Name) | empty | not)) }}
{{- $secret := (lookup "v1" "Secret" .Release.Namespace (printf "%s-password" .Chart.Name)) | default dict }}
{{- $legacySecret := (lookup "v1" "Secret" .Release.Namespace "db-passwords") | default dict }}
{{- /* only attempt to create secret when secret not exists or the existing secret is part of current helm release */}}
{{- if or (empty $secret) (include "magda.isPartOfRelease" (dict "objectData" $secret "root" .) | empty | not) }}
{{- $secretPassword := get (get $secret "data" | default dict) "password" }}
{{- $legacySecretPassword := get (get $legacySecret "data" | default dict) (printf "%s-client" .Chart.Name) }}
apiVersion: v1
kind: Secret
metadata:
  name: "{{ .Chart.Name }}-password"
  annotations:
    "helm.sh/resource-policy": keep
type: Opaque
data:
{{- if $secret }}
  password: {{ $secretPassword | quote }}
{{- else if $legacySecretPassword }}
  password: {{ $legacySecretPassword | quote }}
{{- else }}
  password: {{ randAlphaNum 16 | b64enc | quote }}
{{- end }}
{{- end }}
{{- end }}
{{- end }}

{{/*
  Generating db client credential secret name
  Parameters:
  - root: root scope. i.e. .
  - dbName: the name of the DB.
  Usage: 
  {{ include "magda.db-client-secret-name" (dict "dbName" "content-db" "root" .) | indent 8 }}
*/}}
{{- define "magda.db-client-secret-name" -}}
{{- if not (hasKey . "root") }}
    {{- fail "The current scope is required via key `root` of the template input for template `magda.db-client-secret-name`." }}
{{- end }}
{{- if not (hasKey . "dbName") }}
    {{- fail "`dbName` is required via key `dbName` of the template input for template `magda.db-client-secret-name`." }}
{{- end }}
{{- $dbName := .dbName }}
{{- $dbSecreteName := printf "%s-password" $dbName }}
{{- with .root }}
{{- $vals := (get . "Values" ) | default dict }}
{{- $globalVals := (get $vals "global" ) | default dict }}
{{- $combinedBbSecret := (lookup "v1" "Secret" .Release.Namespace "combined-db-password") | default dict }}
{{- $legacyDbSecret := (lookup "v1" "Secret" .Release.Namespace "db-passwords") | default dict }}
{{- $useInK8sDbInstance := (get $globalVals "useInK8sDbInstance" ) | default dict }}
{{- $useCombinedDb := get $globalVals "useCombinedDb" }}
  {{- if and $useCombinedDb (get $useInK8sDbInstance $dbName) }}
    {{- /* Logic DB use seperate in k8s DB. Should load client pass from "%s-password" secret. */}}
    {{- printf "%s-password" $dbName }}
  {{- else }}
    {{- if and (empty $combinedBbSecret) ($legacyDbSecret | empty | not) }}
      {{- /* 
        when `combined-db` not exists at deploy time but legacy `db-passwords` exists, we use `db-passwords` for backward compatibility reason. 
        `lookup` function can't find auto created secret that is yet to create by the possible first deployment.
        But as the auto created secret will use the value that is copied from legacy `db-passwords` secret (only when exists), this behaviour will not bring us any troubles.
      */}}
      {{- print "db-passwords" }}
    {{- else }}
      {{- printf "%s-password" "combined-db" }}
    {{- end }}
  {{- end }}
{{- end }}
{{- end -}}

{{/*
  Generating db client credential secret key
  Parameters:
  - root: root scope. i.e. .
  - dbName: the name of the DB.
  Usage: 
  {{ include "magda.db-client-secret-key" (dict "dbName" "content-db" "root" .) | indent 8 }}
*/}}
{{- define "magda.db-client-secret-key" -}}
{{- if not (hasKey . "root") }}
    {{- fail "The current scope is required via key `root` of the template input for template `magda.db-client-secret-key`." }}
{{- end }}
{{- if not (hasKey . "dbName") }}
    {{- fail "`dbName` is required via key `dbName` of the template input for template `magda.db-client-secret-key`." }}
{{- end }}
{{- $dbName := .dbName }}
{{- with .root }}
{{- $vals := (get . "Values" ) | default dict }}
{{- $globalVals := (get $vals "global" ) | default dict }}
{{- $combinedBbSecret := (lookup "v1" "Secret" .Release.Namespace "combined-db-password") | default dict }}
{{- $legacyDbSecret := (lookup "v1" "Secret" .Release.Namespace "db-passwords") | default dict }}
{{- $useInK8sDbInstance := (get $globalVals "useInK8sDbInstance" ) | default dict }}
{{- $useCombinedDb := get $globalVals "useCombinedDb" }}
  {{- if and $useCombinedDb (get $useInK8sDbInstance $dbName) }}
    {{- /* Logic DB use seperate in k8s DB. Should load client pass from "%s-password" secret using key `password`. */}}
    {{- print "password" }}
  {{- else }}
    {{- if and (empty $combinedBbSecret) ($legacyDbSecret | empty | not) }}
      {{- /* See template `magda.db-client-secret-name`. We use legacy `db-passwords` and key "%s-client" */}}
      {{- printf "%s-client" $dbName }}
    {{- else }}
      {{- /* Use `combined-db` secret key `password` */}}
      {{- print "password" }}
    {{- end }}
  {{- end }}
{{- end }}
{{- end -}}

{{/*
  Generating db client credential env vars for service deployment
  Parameters:
  - root: root scope. i.e. .
  - dbName: the name of the DB.
  - dbUserEnvName: optional; "PGUSER" by default.
  - dbPasswordEnvName: optional; "PGPASSWORD" by default.
  Usage: 
  {{ include "magda.db-client-credential-env" (dict "dbName" "content-db" "root" .) | indent 8 }}
  Or 
  {{ include "magda.db-client-credential-env" (dict "dbName" "content-db" "dbUserEnvName" "POSTGRES_USER" "dbPasswordEnvName" "POSTGRES_PASSWORD" "root" .) | indent 8 }}
*/}}
{{- define "magda.db-client-credential-env" }}
{{- if not (hasKey . "root") }}
    {{- fail "`root` scope is required via key `root` of the template input for template `magda.common.db-client-credential-env`." }}
{{- end }}
{{- if not (hasKey . "dbName") }}
    {{- fail "`dbName` is required via key `dbName` of the template input for template `magda.common.db-client-credential-env`." }}
{{- end }}
{{- $dbName := .dbName }}
{{- $dbUserEnvName := .dbUserEnvName }}
{{- $dbPasswordEnvName := .dbPasswordEnvName }}
{{- with .root }}
{{- $vals := (get . "Values" ) | default dict }}
{{- $globalVals := (get $vals "global" ) | default dict }}
- name: {{ $dbUserEnvName | default "PGUSER" | quote }}
  value: client
- name: "PGSSLMODE"
  value: {{ include "magda.postgres-client-sslmode" . | quote }}
    {{- /* `noDbAuth` is not supported since Magda v1.0.0. Still check it for the backward compatibility reason. */}}
    {{- if empty (get $globalVals "noDbAuth") }}
- name: {{ $dbPasswordEnvName | default "PGPASSWORD" | quote }}
  valueFrom:
    secretKeyRef:
      name: {{ include "magda.db-client-secret-name" (dict "dbName" $dbName "root" .) | quote }}
      key: {{ include "magda.db-client-secret-key" (dict "dbName" $dbName "root" .) | quote }}
    {{- end }}
{{- end }}
{{- end }}

{{/*
  Resolve the PostgreSQL client `sslmode` for all DB connections.

  Magda supports exactly `disable` and `require`:
  - `prefer` / `allow` cannot be honoured consistently. libpq (psql, wal-g) and
    pgjdbc (registry-api, Flyway) implement them natively, but node-postgres maps
    `prefer` to `ssl: true` and hard-fails against a server that doesn't offer
    TLS instead of falling back. Rejecting them is better than giving the Node
    services different semantics from every other component.
  - `verify-ca` / `verify-full` need a CA certificate delivered into each pod,
    and no DB-connecting component exposes an extension point for that yet.

  Resolution order:
  1. An explicitly configured value always wins.
  2. `useCloudSql` resolves to `disable` — cloud_sql_proxy presents a plaintext
     listener and performs TLS to Cloud SQL itself.
  3. Everything else (in-cluster, RDS, Azure, direct Cloud SQL) resolves to
     `require`.

  Note on the in-cluster server: `require` is always correct for it because the
  in-cluster PostgreSQL serves TLS by default and its listener can only be turned
  off per DB chart (`<db-chart>.magda-postgres.postgresql.tls.enabled` — a
  subchart value, which no `global.*` switch can drive). This resolution
  therefore cannot see the server-side setting; instead the `magda-postgres`
  chart — the one place that sees both sides — rejects the contradictory
  combination at render time (`magda-postgres/templates/validate-tls.yaml`).

  Parameters: the root scope. i.e. .
  Usage:
  {{ include "magda.postgres-client-sslmode" . }}
*/}}
{{- define "magda.postgres-client-sslmode" -}}
{{- $globalVals := (get .Values "global") | default dict -}}
{{- $pgVals := (get $globalVals "postgresql") | default dict -}}
{{- /* `global.postgresql.tls.enabled` briefly existed on the DB-TLS development
       branch and never worked: it could not reach the subchart value the
       StatefulSet actually consumes, so it silently did nothing while appearing
       to control the server's TLS listener. Reject it loudly rather than let it
       be a no-op again. */ -}}
{{- if hasKey $pgVals "tls" -}}
{{- fail "`global.postgresql.tls` is not a supported Magda value. The in-cluster PostgreSQL TLS listener is controlled per DB chart by `<db-chart>.magda-postgres.postgresql.tls.enabled` (e.g. `combined-db.magda-postgres.postgresql.tls.enabled`); client-side TLS is controlled by `global.postgresql.client.sslmode`. See the `magda-postgres` chart README." -}}
{{- end -}}
{{- $clientVals := (get $pgVals "client") | default dict -}}
{{- /* Normalised the same way magda-typescript-common/src/createPgPool.ts does
       (`.trim().toLowerCase()`), so both layers accept the same vocabulary. */ -}}
{{- $sslmode := (get $clientVals "sslmode") | default "" | toString | trim | lower -}}
{{- if empty $sslmode -}}
  {{- if get $globalVals "useCloudSql" -}}
    {{- $sslmode = "disable" -}}
  {{- else -}}
    {{- $sslmode = "require" -}}
  {{- end -}}
{{- end -}}
{{- if not (has $sslmode (list "disable" "require")) -}}
{{- fail (printf "Unsupported global.postgresql.client.sslmode value %q. Magda supports \"disable\" and \"require\" only. \"prefer\"/\"allow\" are not supported because node-postgres cannot negotiate them consistently — use \"require\". \"verify-ca\"/\"verify-full\" require CA distribution, which is not implemented yet (see issue #3739)." $sslmode) -}}
{{- end -}}
{{- $sslmode -}}
{{- end -}}
