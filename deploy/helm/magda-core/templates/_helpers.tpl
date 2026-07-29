{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "dockerimage" -}}
"{{ .Values.image.repository | default .Values.global.image.repository }}/magda-{{ .Chart.Name }}:{{ .Values.image.tag | default .Values.global.image.tag | default .Chart.Version }}"
{{- end -}}

{{- define "postgres" -}}
"{{ .Values.image.repository | default .Values.global.image.repository }}/magda-postgres:{{ .Values.image.tag | default .Values.global.image.tag | default .Chart.Version }}"
{{- end -}}

{{- define "magda.postgres-svc-mapping" }}
  {{- if .Values.global.useAwsRdsDb }}
  type: ExternalName
  externalName: "{{ .Values.global.awsRdsEndpoint | required "global.awsRdsEndpoint is required" }}"
  {{- else if .Values.global.useCloudSql }}
  selector:
    service: "cloud-sql-proxy"
  {{- else if and .Values.global.useCombinedDb (empty (get .Values.global.useInK8sDbInstance .Chart.Name)) }}
  selector:
    app.kubernetes.io/instance: "{{ .Release.Name }}"
    app.kubernetes.io/name: "combined-db-postgresql"
    role: primary
  {{- else }}
  selector:
    app.kubernetes.io/instance: "{{ .Release.Name }}"
    app.kubernetes.io/name: "{{ .Chart.Name }}-postgresql"
    role: primary
  {{- end -}}
{{- end }}

{{- define "magda.postgres-superuser-env" }}
- name: PGUSER
  value: {{ include "magda.postgres-privileged-username" . | quote }}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.global.postgresql.existingSecret | quote }}
      key: "postgresql-password"
- name: PGSSLMODE
  value: {{ include "magda.postgres-client-sslmode" . | quote }}
{{- end }}

{{- define "magda.postgres-privileged-username" }}
{{- $username := .Values.global.postgresql.postgresqlUsername | default "postgres" -}}
{{- $usesExternalDb := or .Values.global.useAwsRdsDb .Values.global.useCloudSql -}}
{{- $allowDefaultExternalDbPostgresUser := .Values.global.postgresql.allowDefaultExternalDbPostgresUser | default false -}}
{{- if and $usesExternalDb (eq $username "postgres") (not $allowDefaultExternalDbPostgresUser) -}}
{{- fail "When global.useAwsRdsDb or global.useCloudSql is enabled, set global.postgresql.postgresqlUsername to the privileged external DB account. If the privileged account is intentionally named \"postgres\", set global.postgresql.allowDefaultExternalDbPostgresUser=true." -}}
{{- end -}}
{{- $username -}}
{{- end }}

{{- define "magda.postgres-migrator-env" }}
- name: PGUSER
  value: {{ include "magda.postgres-privileged-username" . | quote }}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.global.postgresql.existingSecret | quote }}
      key: "postgresql-password"
- name: PGSSLMODE
  value: {{ include "magda.postgres-client-sslmode" . | quote }}
- name: CLIENT_USERNAME
  value: client
- name: CLIENT_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "magda.db-client-secret-name" (dict "dbName" .Chart.Name "root" .) | quote }}
      key: {{ include "magda.db-client-secret-key" (dict "dbName" .Chart.Name "root" .) | quote }}
{{- end }}

{{/*
  PLACEMENT — these MUST stay in magda-core, never magda-common: magda-common is
  vendored by a dozen third-party charts and Helm's flat namespace lets a stale
  vendored copy silently shadow it (that is how the Node services once connected
  to PostgreSQL in plaintext). Prefer extending `magda.db-client-sslmode-env`
  over the shared credential helper; external charts reach it through the
  versioned shim `magda.db-client-sslmode-env-v1` in magda-common.
  Full rationale, failure matrix and change rules: docs/docs/helm-helper-contracts.md
*/}}
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

{{/*
  Emit the `PGSSLMODE` env var for a DB *client* (a service connecting as the
  restricted `client` role). Included alongside `magda.db-client-credential-env`
  rather than being part of it — see the placement note above.

  Parameters: the root scope. i.e. .
  Usage:
  {{ include "magda.db-client-sslmode-env" . | indent 8 }}
*/}}
{{- define "magda.db-client-sslmode-env" }}
- name: "PGSSLMODE"
  value: {{ include "magda.postgres-client-sslmode" . | quote }}
{{- end }}

{{/*
  Compatibility handshake for the versioned helper templates that external charts
  (authentication plugins in particular) vendor from `magda-common`. Detection is
  inverted — Magda cannot see its own siblings, so the plugin calls in here
  announcing which contract it was built against and this template adjudicates.
  It MUST stay in magda-core (nothing vendors it, so nothing can shadow it); never
  add a no-op fallback copy — the fallback would win the shadowing race and the
  check would silently stop running.
  Full rationale, failure matrix and add/retire rules: docs/docs/helm-helper-contracts.md

  Parameters (dict):
  - helper: the versioned helper name the caller was built against,
            e.g. "db-client-sslmode-env-v1"
  - chart:  the calling chart's name, used to make the error actionable
  Usage (from a versioned magda-common helper):
  {{ include "magda.compatibility-check" (dict "helper" "db-client-sslmode-env-v1" "chart" .Chart.Name) }}
*/}}
{{- define "magda.compatibility-check" -}}
{{- $helper := .helper | default "<unknown>" -}}
{{- $chart := .chart | default "<unknown chart>" -}}
{{- /*
  Helper contracts this Magda version honours. Add a name here when introducing
  a new versioned helper; REMOVE one when dropping support, which turns silent
  misbehaviour into a loud, actionable failure at render time.
*/ -}}
{{- $supported := list "db-client-sslmode-env-v1" -}}
{{- if not (has $helper $supported) -}}
{{- fail (printf "Chart %q uses the Magda helper contract %q, which this version of Magda does not support (supported: %s). Upgrade or downgrade %q to a release built for this Magda version. If you are intentionally running a mismatched pair and accept the consequences, set `global.magdaCompatibilityCheck=false` to skip this check." $chart $helper (join ", " $supported) $chart) -}}
{{- end -}}
{{- end -}}

