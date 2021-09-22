{{/* vim: set filetype=mustache: */}}
{{/*
  Generating `imagePullSecrets` field (for a k8s deployment or pod etc.) based on .Values.image & .Values.global.image.pullSecret
  Parameters / Input: 
    Must passing the root scope as the template input.
    The logic db name will be retrieved via `.Chart.Name`
  Usage: 
  {{- include "magda.db-client-password-secret-creation" . }}
*/}}
{{- define "magda.pullSecrets" -}}
  {{- $pullSecrets := list }}
  {{- if not (empty .Values.image) }}
  {{- if kindIs "string" .Values.image.pullSecret  }}
    {{- $pullSecrets = append $pullSecrets .Values.image.pullSecret }}
  {{- end }}
  {{- if kindIs "map" .Values.image.pullSecret }}
    {{- $pullSecrets = concat $pullSecrets .Values.image.pullSecrets }}
  {{- end }}
  {{- end }}
  {{- if empty $pullSecrets }}
    {{- if kindIs "string" .Values.global.image.pullSecret }}
      {{- $pullSecrets = append $pullSecrets .Values.global.image.pullSecret }}
    {{- end }}
    {{- if kindIs "map" .Values.global.image.pullSecrets }}
      {{- $pullSecrets = concat $pullSecrets .Values.global.image.pullSecrets }}
    {{- end }}
  {{- end }}
  {{- if (not (empty $pullSecrets)) }}
imagePullSecrets:
    {{- range $pullSecrets }}
  - name: {{ . }}
    {{- end }}
  {{- end }}
{{- end -}}