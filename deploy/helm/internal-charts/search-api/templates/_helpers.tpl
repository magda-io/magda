{{/* vim: set filetype=mustache: */}}
{{/*
  Generate the raw app-conf.json from global and local values.
  - It will also consider older version config format for best backward compatibility effort.
  - Also, will set the hybridSearch enabled flag in the appConfig based on the global value.
    See config at [common.conf](https://github.com/magda-io/magda/blob/main/magda-scala-common/src/main/resources/common.conf)
  Usage:
    deploy-application.conf: {{ include "magda.search-api.appConfig" . | quote }}
    OR
    checksum/config: {{ include "search-api.appConfig" . | sha256sum }}
*/}}
{{- define "magda.search-api.appConfig" -}}
{{- $appConfigDictInVal := (get .Values "appConfig") | default dict | mustDeepCopy }}
{{- $cfgElasticsearch := (hasKey $appConfigDictInVal "elasticSearch") | ternary (get $appConfigDictInVal "elasticSearch") dict }}
{{- $cfgElasticsearchIdx := (hasKey $cfgElasticsearch "indices") | ternary (get $cfgElasticsearch "indices") dict }}
{{- $cfgElasticsearchIdxDatasets := (hasKey $cfgElasticsearchIdx "datasets") | ternary (get $cfgElasticsearchIdx "datasets") dict }}
{{- $cfgElasticsearchIdxDatasetsHybridSearch := (hasKey $cfgElasticsearchIdxDatasets "hybridSearch") | ternary (get $cfgElasticsearchIdxDatasets "hybridSearch") dict }}
{{- $hybridSearchEnabled := (hasKey $cfgElasticsearchIdxDatasetsHybridSearch "enabled") | ternary (get $cfgElasticsearchIdxDatasetsHybridSearch "enabled") (dig "searchEngine" "hybridSearch" "enabled" true .Values.global) }}
{{- $_ := set $cfgElasticsearchIdxDatasetsHybridSearch "enabled" $hybridSearchEnabled }}
{{- $_ := set $cfgElasticsearchIdxDatasets "hybridSearch" $cfgElasticsearchIdxDatasetsHybridSearch }}
{{- $_ := set $cfgElasticsearchIdx "datasets" $cfgElasticsearchIdxDatasets }}
{{- $_ := set $cfgElasticsearch "indices" $cfgElasticsearchIdx }}
{{- $_ := set $appConfigDictInVal "elasticSearch" $cfgElasticsearch }}
{{- $akka := get $appConfigDictInVal "akka" | default dict }}
{{- if not (hasKey $akka "loglevel") }}
{{- $_ := set $akka "loglevel" (get .Values.global "logLevel" | default "INFO") }}
{{- $_ := set $appConfigDictInVal "akka" $akka }}
{{- end }}
{{- mustToRawJson $appConfigDictInVal }}
{{- end -}}