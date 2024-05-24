{{/* vim: set filetype=mustache: */}}

{{/*
    Modified from https://github.com/bitnami/charts/blob/d502935e8ae025beb7690cc8d611f1e71972a594/bitnami/common/templates/_labels.tpl
    [Licensed under Apache 2.0 License](https://github.com/bitnami/charts/blob/d502935e8ae025beb7690cc8d611f1e71972a594/LICENSE.md)
*/}}


{{/*
Kubernetes standard labels
Usage:
- {{ include "magda.common.labels.standard" (dict "customLabels" .Values.commonLabels "root" $) -}}
- Or: {{ include "magda.common.labels.standard" $ -}}
*/}}
{{- define "magda.common.labels.standard" -}}
{{- $root := . -}}
{{- if hasKey . "root" -}}
{{- $root = .root -}}
{{- end -}}
{{- if and (hasKey . "customLabels") (hasKey . "root") -}}
{{- $default := dict "app.kubernetes.io/name" (include "magda.name" .root) "helm.sh/chart" (include "magda.chart" .root) "app.kubernetes.io/instance" .root.Release.Name "app.kubernetes.io/managed-by" .root.Release.Service -}}
{{- with .root.Chart.AppVersion -}}
{{- $_ := set $default "app.kubernetes.io/version" . -}}
{{- end -}}
{{ template "magda.common.tplvalues.merge" (dict "values" (list .customLabels $default) "root" .root) }}
{{- else -}}
app.kubernetes.io/name: {{ include "magda.name" $root }}
helm.sh/chart: {{ include "magda.chart" $root }}
app.kubernetes.io/instance: {{ $root.Release.Name }}
app.kubernetes.io/managed-by: {{ $root.Release.Service }}
{{- with $root.Chart.AppVersion }}
app.kubernetes.io/version: {{ . | quote }}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Labels used on immutable fields such as deploy.spec.selector.matchLabels or svc.spec.selector
We don't want to loop over custom labels appending them to the selector
since it's very likely that it will break deployments, services, etc.
However, it's important to overwrite the standard labels if the user
overwrote them on metadata.labels fields.
Usage:
- {{ include "magda.common.labels.matchLabels" (dict "customLabels" .Values.podLabels "root" $) -}}
- Or: {{ include "magda.common.labels.matchLabels" $ -}}
*/}}
{{- define "magda.common.labels.matchLabels" -}}
{{- $root := . -}}
{{- if hasKey . "root" -}}
{{- $root = .root -}}
{{- end -}}
{{- if and (hasKey . "customLabels") (hasKey . "root") -}}
{{ merge (pick (include "magda.common.tplvalues.render" (dict "value" .customLabels "root" .root) | fromYaml) "app.kubernetes.io/name" "app.kubernetes.io/instance") (dict "app.kubernetes.io/name" (include "magda.name" .root) "app.kubernetes.io/instance" .root.Release.Name ) | toYaml }}
{{- else -}}
app.kubernetes.io/name: {{ include "magda.name" $root }}
app.kubernetes.io/instance: {{ $root.Release.Name }}
{{- end -}}
{{- end -}}