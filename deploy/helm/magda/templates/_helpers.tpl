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
"{{ .Values.image.repository | default .Values.global.image.repository }}/magda-{{ .Chart.Name }}:{{ .Values.image.tag | default .Values.global.image.tag }}"
{{- end -}}

{{- define "magda.postgres-env" }}
        - name: BACKUP
          value: {{ .Values.waleBackup.method | quote }}
        - name: WALE_S3_PREFIX
          value: {{ .Values.waleBackup.s3Prefix }}
        - name: AWS_ACCESS_KEY_ID
          value: {{ .Values.waleBackup.awsAccessKeyId }}
        - name: AWS_SECRET_ACCESS_KEY
          value: {{ .Values.waleBackup.secretAccessKey }}
        - name: AWS_REGION
          value: {{ .Values.waleBackup.awsRegion }}
        - name: WALE_WABS_PREFIX
          value: {{ .Values.waleBackup.wabsPrefix }}
        - name: WABS_ACCOUNT_NAME
          value: {{ .Values.waleBackup.wabsAccountName }}
        - name: WABS_ACCESS_KEY
          value: {{ .Values.waleBackup.wabsAccessKey }}
        - name: WABS_SAS_TOKEN
          value: {{ .Values.waleBackup.wabsSasToken }}
        - name: WALE_GS_PREFIX
          value: {{ .Values.waleBackup.gsPrefix }}
        {{- if .Values.waleBackup.googleApplicationCredentials }}
        - name: GOOGLE_APPLICATION_CREDENTIALS
          value: {{ .Values.waleBackup.googleApplicationCredentials }}
        {{- end }}
        - name: WALE_SWIFT_PREFIX
          value: {{ .Values.waleBackup.swiftPrefix }}
        - name: SWIFT_AUTHURL
          value: {{ .Values.waleBackup.swiftAuthUrl }}
        - name: SWIFT_TENANT
          value: {{ .Values.waleBackup.swiftTenant }}
        - name: SWIFT_USER
          value: {{ .Values.waleBackup.swiftUser }}
        - name: SWIFT_PASSWORD
          value: {{ .Values.waleBackup.swiftPassword }}
        - name: SWIFT_AUTH_VERSION
          value: {{ .Values.waleBackup.swiftAuthVersion }}
        - name: SWIFT_ENDPOINT_TYPE
          value: {{ .Values.waleBackup.swiftEndpointType }}
        - name: BACKUP_EXECUTION_TIME
          value: {{ .Values.waleBackup.executionTime }}
{{- end }}