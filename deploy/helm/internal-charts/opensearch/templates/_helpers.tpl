{{/* vim: set filetype=mustache: */}}

{{/*
  Create a default fully qualified data node name.
  We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "magda.opensearch.data.fullname" -}}
{{- $name := default "data" .Values.data.nameOverride -}}
{{- if .Values.data.fullnameOverride -}}
{{- .Values.data.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" (include "magda.fullname" .) $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/*
  Create a default fully qualified client node name.
  We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "magda.opensearch.client.fullname" -}}
{{- $name := default "client" .Values.client.nameOverride -}}
{{- if .Values.client.fullnameOverride -}}
{{- .Values.client.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" (include "magda.fullname" .) $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/*
  Create a default fully qualified master node name.
  We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "magda.opensearch.master.fullname" -}}
{{- $name := default "master" .Values.master.nameOverride -}}
{{- if .Values.master.fullnameOverride -}}
{{- .Values.master.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" (include "magda.fullname" .) $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "magda.opensearch.roles" -}}
{{- range $.Values.roles -}}
{{ . }},
{{- end -}}
{{- end -}}

{{/* add initContainer that will configure linux kernel parameters & resource usage limit for elasticsearch */}}
{{- define "magda.opensearch.initContainer" }}
initContainers:
- name: "sysctl"
  securityContext:
    privileged: true
  image: {{ include "magda.image" (dict "image" .Values.initContainerImage) | quote }}
  imagePullPolicy: {{ include "magda.imagePullPolicy" (dict "image" .Values.initContainerImage) | quote }}
  command:
  - "/bin/sh"
  - "-c"
  - |
    echo "Print current vm.max_map_count value in host: "
    sysctl vm.max_map_count
    echo "Set vm.max_map_count=262144 in host..."
    sysctl -w vm.max_map_count=262144
    echo "Re-print current vm.max_map_count value in host: "
    sysctl vm.max_map_count
    echo "done!"
{{- end }}

