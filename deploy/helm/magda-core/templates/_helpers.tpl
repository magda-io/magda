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

{{- define "magda.postgres-svc-mapping" -}}
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
{{- end -}}

{{- define "magda.postgres-superuser-env" }}
- name: PGUSER
  value: {{ .Values.global.postgresql.postgresqlUsername | default "postgres" }}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.global.postgresql.existingSecret | quote }}
      key: "postgresql-password"
{{- end -}}

{{- define "magda.postgres-migrator-env" }}
- name: PGUSER
  value: {{ .Values.global.postgresql.postgresqlUsername | default "postgres" }}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.global.postgresql.existingSecret | quote }}
      key: "postgresql-password"
- name: CLIENT_USERNAME
  value: client
- name: CLIENT_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "magda.db-client-secret-name" (dict "dbName" .Chart.Name "root" .) | quote }}
      key: {{ include "magda.db-client-secret-key" (dict "dbName" .Chart.Name "root" .) | quote }}
{{- end -}}
