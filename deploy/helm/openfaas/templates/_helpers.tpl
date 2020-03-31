{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "openfaas.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "openfaas.fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/*
Expand the full main namespace string.
*/}}
{{- define "openfaas.mainNamespace" -}}
{{- $namespacePrefix :=  .Values.namespacePrefix | default .Values.global.openfaas.namespacePrefix | default .Values.defaultValues.namespacePrefix | default .Release.Namespace -}}
{{- $mainNamespace :=  .Values.mainNamespace | default .Values.global.openfaas.mainNamespace | default .Values.defaultValues.mainNamespace -}}
{{- if not $mainNamespace -}}
{{- fail "`mainNamespace` can't be empty"  -}}
{{- end -}}
{{- $mainNamespace | printf "%s-%s" (required "Please provide namespacePrefix for openfaas chart" $namespacePrefix) -}}
{{- end -}}

{{/*
Expand the full function namespace string.
*/}}
{{- define "openfaas.functionNamespace" -}}
{{- $namespacePrefix :=  .Values.namespacePrefix | default .Values.global.openfaas.namespacePrefix | default .Values.defaultValues.namespacePrefix | default .Release.Namespace -}}
{{- $functionNamespace :=  .Values.functionNamespace | default .Values.global.openfaas.functionNamespace | default .Values.defaultValues.functionNamespace -}}
{{- if not $functionNamespace -}}
{{- fail "`functionNamespace` can't be empty"  -}}
{{- end -}}
{{- $functionNamespace | printf "%s-%s" (required "Please provide namespacePrefix for openfaas chart" $namespacePrefix) -}}
{{- end -}}
