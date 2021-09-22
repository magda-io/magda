{{/* vim: set filetype=mustache: */}}
{{/*
  Given a k8s object data (in dict type), test if it's part of helm release by the following metadata:
  - annotations: 
    - "meta.helm.sh/release-name" should be $.Release.Name
    - "meta.helm.sh/release-namespace" should be $.Release.Namespace.
  - labels:
    - "app.kubernetes.io/managed-by": should be $.Release.Service
  Parameter: 
    - "objectData": dict. the k8s object data.
    - "root": helm root context data `.`
  Return value: string "true" (indicate it's part of release) or empty string ""
  Usage: 
  {{- if include "magda.isPartOfRelease" (dict "objectData" $k8sObjectData "root" . ) }}
    {{- print "Is part of release"}}
  {{- else }}
    {{- print "Is not part of release"}}
  {{- if}}
*/}}
{{- define "magda.isPartOfRelease" -}}
{{- $objectData := .objectData | default dict }}
{{- $metadata := (get $objectData "metadata") | default dict }}
{{- $annotations := (get $metadata "annotations") | default dict }}
{{- $labels := (get $metadata "labels") | default dict }}
{{- if and (get $annotations "meta.helm.sh/release-name" | eq .root.Release.Name) (get $annotations "meta.helm.sh/release-namespace" | eq .root.Release.Namespace) (get $labels "app.kubernetes.io/managed-by" | eq .root.Release.Service) }}
  {{- print "true" }}
{{- else }}
  {{- print "" }}
{{- end }}
{{- end -}}