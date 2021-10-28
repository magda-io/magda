{{/* vim: set filetype=mustache: */}}
{{/*
  Generate the raw web.json from global and local values.

  Usage:
    web.json: {{ include "magda.web-server.webconfig" . | quote }}
    OR
    checksum/config: {{ include "magda.web-server.webconfig" . | sha256sum }}
*/}}
{{- define "magda.web-server.webconfig" -}}
{{- $webConfigDict := omit .Values "global" "autoscaler" "resources" "service" "replicas" }}
{{- $_ := set $webConfigDict "baseExternalUrl" .Values.global.externalUrl }}
{{- $_ := set $webConfigDict "authPluginRedirectUrl" .Values.global.authPluginRedirectUrl }}
{{- $_ := .Values.global.useLocalStyleSheet | default .Values.useLocalStyleSheet | set $webConfigDict "useLocalStyleSheet" }}
{{- $_ := .Values.defaultDatasetBucket | default .Values.global.defaultDatasetBucket | set $webConfigDict "defaultDatasetBucket" }}
{{- $_ := .Chart.Version | dict "tag" | merge (.Values.global.image | default dict | deepCopy | merge (deepCopy .Values.image)) | set $webConfigDict "image" }}
{{- mustToRawJson $webConfigDict }}
{{- end -}}