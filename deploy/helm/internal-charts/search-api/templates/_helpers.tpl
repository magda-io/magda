{{/* vim: set filetype=mustache: */}}
{{/*
  Generate the raw app-conf.json from global and local values.
  It will also consider older version config format for best backward compatibility effort.
  Usage:
    deploy-application.conf: {{ include "magda.search-api.appConfig" . | quote }}
    OR
    checksum/config: {{ include "search-api.appConfig" . | sha256sum }}
*/}}
{{- define "magda.search-api.appConfig" -}}
{{- $appConfigDictInVal := (get .Values "appConfig") | default dict | mustDeepCopy }}
{{- $akka := get $appConfigDictInVal "akka" | default dict }}
{{- if not (hasKey $akka "loglevel") }}
{{- $_ := set $akka "loglevel" (get .Values.global "logLevel" | default "INFO") }}
{{- $_ := set $appConfigDictInVal "akka" $akka }}
{{- end }}
{{- mustToRawJson $appConfigDictInVal }}
{{- end -}}