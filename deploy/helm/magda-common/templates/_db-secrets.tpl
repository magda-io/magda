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
  Versioned PGSSLMODE env-var helper for EXTERNAL charts (auth plugins and
  anything connecting to a Magda DB as the restricted `client` role). Magda's own
  charts do NOT use this — they call `magda.db-client-sslmode-env` in magda-core.

  A THIN SHIM with no logic of its own: it only runs the compatibility check and
  delegates to magda-core, so no vendored copy can change what gets emitted.

  FROZEN CONTRACT — once released, `-v1` behaviour must never change (many charts
  vendor their own copy and any may be the one that runs). Change behaviour by
  adding `-v2` and leaving this untouched.

  REQUIRES MAGDA v7+. In a release without magda-core v7+ — including a standalone
  `helm template`/`helm lint` of the plugin in CI — it fails with
  `no template "magda.compatibility-check" associated`. Plugin charts MUST default
  `global.magdaCompatibilityCheck` to `true` in their values.yaml (read as a
  GLOBAL so an operator can disable it once for every plugin) and set it `false`
  for standalone CI renders.

  Full rationale, failure matrix and rules: docs/docs/helm-helper-contracts.md

  Usage (from an external chart's deployment template):
  {{- include "magda.db-client-sslmode-env-v1" . | indent 8 }}
*/}}
{{- define "magda.db-client-sslmode-env-v1" -}}
{{- $globalVals := (get .Values "global") | default dict -}}
{{- /*
  Default to enabled when the key is absent, so forgetting to declare it fails
  closed (loudly) rather than silently skipping the check. `default` is not used
  here because Helm treats an explicit `false` as empty and would flip it back
  to `true`.
*/ -}}
{{- $enabled := true -}}
{{- if hasKey $globalVals "magdaCompatibilityCheck" -}}
{{- $enabled = (get $globalVals "magdaCompatibilityCheck") -}}
{{- end -}}
{{- if $enabled -}}
{{- include "magda.compatibility-check" (dict "helper" "db-client-sslmode-env-v1" "chart" .Chart.Name) -}}
{{- include "magda.db-client-sslmode-env" . -}}
{{- end -}}
{{- end -}}

