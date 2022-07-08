{{/* vim: set filetype=mustache: */}}
{{/*
  Generating `imagePullSecrets` field (for a k8s deployment or pod etc.) based on:
  - `.Values.image`: this config will always be considered.
  - `.Values.global.image`: Only used when `magdaModuleType` = `core`
  - `.Values.connectors.image`: Only used when `magdaModuleType` = `connector`
  - `.Values.minions.image`: Only used when `magdaModuleType` = `minion`
  - `.Values.urlProcessors.image`: Only used when `magdaModuleType` = `urlProcessor`

  `magdaModuleType` can be set via `annotations` field of Chart.yaml.
  If not set, it will assume `magdaModuleType` = `core`.

  Parameters / Input: 
    Must passing the root scope as the template input.
  Usage: 
  {{- include "magda.imagePullSecrets" . | indent 10 }}
*/}}
{{- define "magda.imagePullSecrets" }}
  {{- $pullSecrets := include "magda.image.getConsolidatedPullSecretList" . | mustFromJson }}
  {{- if (not (empty $pullSecrets)) }}
imagePullSecrets:
    {{- range $pullSecrets }}
  - name: {{ . | quote }}
    {{- end }}
  {{- end }}
{{- end }}

{{/*
  Get consolidated image pull secret lists based on:
  - `.Values.image`: this config will always be considered.
  - `.Values.global.image`: Only used when `magdaModuleType` = `core`
  - `.Values.connectors.image`: Only used when `magdaModuleType` = `connector`
  - `.Values.minions.image`: Only used when `magdaModuleType` = `minion`
  - `.Values.urlProcessors.image`: Only used when `magdaModuleType` = `urlProcessor`

  `magdaModuleType` can be set via `annotations` field of Chart.yaml.
  If not set, it will assume `magdaModuleType` = `core`.

  Parameters / Input: 
    Must passing the root scope as the template input.

  Return:
    an array of image pull secret name as JSON string. 
    You are supposed to call `mustFromJson` to convert it back to the original value.
    if can't find the config, it will return string `[]` which will be convert to empty list by `mustFromJson`.
  Usage: 
    {{- $pullSecretList := include "magda.image.getConsolidatedPullSecretList" . | mustFromJson }}
*/}}
{{- define "magda.image.getConsolidatedPullSecretList" -}}
  {{- /* unfortunately, `concat list list` will produce null. we need to make sure the list is not empty to fix this. */}}
  {{- $pullSecrets := list "" }}
  {{- $values := get . "Values" | default dict }}
  {{- $imageConfig := .image | default $values.image | default dict }}
  {{- if not (empty $imageConfig) }}
    {{- $pullSecretList := include "magda.image.getPullSecretList" $imageConfig | mustFromJson }}
    {{- $pullSecrets = concat $pullSecrets $pullSecretList }}
  {{- end }}
  {{- $magdaModuleType := include "magda.getMagdaModuleType" . }}
  {{- $global := get $values "global" | default dict }}
  {{- $connectorsConfig := get $global "connectors" | default dict }}
  {{- $minionsConfig := get $global "minions" | default dict }}
  {{- $urlProcessorsConfig := get $global "urlProcessors" | default dict }}
  {{- if and (eq $magdaModuleType "core") (get $global "image" | empty | not) }}
    {{- $pullSecretList := include "magda.image.getPullSecretList" (get $global "image") | mustFromJson }}
    {{- $pullSecrets = concat $pullSecrets $pullSecretList }}
  {{- else if and (eq $magdaModuleType "connector") (get $connectorsConfig "image" | empty | not) }}
    {{- $pullSecretList := include "magda.image.getPullSecretList" (get $connectorsConfig "image") | mustFromJson }}
    {{- $pullSecrets = concat $pullSecrets $pullSecretList }}
  {{- else if and (eq $magdaModuleType "minion") (get $minionsConfig "image" | empty | not) }}
    {{- $pullSecretList := include "magda.image.getPullSecretList" (get $minionsConfig "image") | mustFromJson }}
    {{- $pullSecrets = concat $pullSecrets $pullSecretList }}
  {{- else if and (eq $magdaModuleType "urlProcessor") (get $urlProcessorsConfig "image" | empty | not) }}
    {{- $pullSecretList := include "magda.image.getPullSecretList" (get $urlProcessorsConfig "image") | mustFromJson }}
    {{- $pullSecrets = concat $pullSecrets $pullSecretList }}
  {{- end }}
  {{- $pullSecrets | mustCompact | mustToJson }}
{{- end -}}

{{/*
  Retrieve image pull secret config from the image config object that is passed in as template input by trying different keys.
  And then convert pull secret config value (could be `false`, `string` or a list of `string`) into a list.
  The function is created for backward compatibility reason.
  Parameters:
    Image config object as the template input.
  Return:
    a list of image pull secret name as JSON string. 
    You are supposed to call `mustFromJson` to convert it back to the original value.
    if can't find the config, it will return string `[]` which will be convert to empty list by `mustFromJson`.
  Usage: 
    {{- $pullSecretList := include "magda.image.getPullSecretList" .Values.image | mustFromJson }}
*/}}
{{- define "magda.image.getPullSecretList" -}}
  {{- $pullSecretsConfig := false }}
  {{- $pullSecretsConfig = (.pullSecrets | empty | not) | ternary .pullSecrets $pullSecretsConfig }}
  {{- $pullSecretsConfig = (.pullSecret | empty | not) | ternary .pullSecret $pullSecretsConfig }}
  {{- $pullSecretsConfig = (.imagePullSecret | empty | not) | ternary .imagePullSecret $pullSecretsConfig }}
  {{- $pullSecretsConfig = (.imagePullSecrets | empty | not) | ternary .imagePullSecrets $pullSecretsConfig }}
  {{- $pullSecretList := list "" }}
  {{- if kindIs "string" $pullSecretsConfig }}
    {{- $pullSecretList = append $pullSecretList $pullSecretsConfig }}
  {{- end }}
  {{- if kindIs "slice" $pullSecretsConfig }}
    {{- $pullSecretList = concat $pullSecretList $pullSecretsConfig }}
  {{- end }}
  {{- $pullSecretList | mustCompact | mustToJson }}
{{- end -}}


{{/*
  Generate a string contains image name, registry & tag info.
  Parameters / input:
    Must passing the root scope as the template input.
  Return:
    a string contains image name, registry & tag info.
  Usage: 
    {{ include "magda.image" . }}
*/}}
{{- define "magda.image" -}}
  {{- $values := get . "Values" | default dict }}
  {{- $chartVersion := "" }}
  {{- if .Chart }}
  {{- $chartVersion = .Chart.Version }}
  {{- end }}
  {{- $magdaModuleType := include "magda.getMagdaModuleType" . }}
  {{- $defaultImageConfig := get $values "defaultImage" | default dict }}
  {{- $tag := get $defaultImageConfig "tag" | default $chartVersion }}
  {{- $repository := get $defaultImageConfig "repository" | default "" }}
  {{- $name := get $defaultImageConfig "name" | default "" }}
  {{- $global := get $values "global" | default dict }}
  {{- $connectorsConfig := get $global "connectors" | default dict }}
  {{- $minionsConfig := get $global "minions" | default dict }}
  {{- $urlProcessorsConfig := get $global "urlProcessors" | default dict }}
  {{- $imageConfig := dict }}
  {{- if and (eq $magdaModuleType "core") (get $global "image" | empty | not) }}
    {{- /* should use `=` instead of `:=` avoid creating a new local var `imageConfig` */}}
    {{- $imageConfig = get $global "image" | default dict }}
  {{- else if and (eq $magdaModuleType "connector") (get $connectorsConfig "image" | empty | not) }}
    {{- $imageConfig = get $connectorsConfig "image" | default dict }}
  {{- else if and (eq $magdaModuleType "minion") (get $minionsConfig "image" | empty | not) }}
    {{- $imageConfig = get $minionsConfig "image" | default dict }}
  {{- else if and (eq $magdaModuleType "urlProcessor") (get $urlProcessorsConfig "image" | empty | not) }}
    {{- $imageConfig = get $urlProcessorsConfig "image" | default dict }}
  {{- end }}
  {{- $tag = get $imageConfig "tag" | default $tag }}
  {{- $repository = get $imageConfig "repository" | default $repository }}
  {{- $name = get $imageConfig "name" | default $name }}
  {{- $imageConfig = .image | default $values.image | default dict }}
  {{- $tag = get $imageConfig "tag" | default $tag | toString }}
  {{- $repository = get $imageConfig "repository" | default $repository | toString }}
  {{- $name = get $imageConfig "name" | default $name | toString }}
  {{- printf "%s%s%s" ($repository | empty | ternary "" (printf "%s/" $repository)) $name ($tag | empty | ternary "" (printf ":%s" $tag )) }}
{{- end -}}


{{/*
  Generate an image pull policy string. e.g. "Always" or "IfNotPresent"
  Parameters / input:
    Must passing the root scope as the template input.
  Return:
    an image pull policy string.
  Usage: 
    {{ include "magda.imagePullPolicy" . }}
*/}}
{{- define "magda.imagePullPolicy" -}}
  {{- $values := get . "Values" | default dict }}
  {{- $magdaModuleType := include "magda.getMagdaModuleType" . }}
  {{- $defaultImageConfig := get $values "defaultImage" | default dict }}
  {{- $pullPolicy := get $defaultImageConfig "pullPolicy" | default "IfNotPresent" }}
  {{- $global := get $values "global" | default dict }}
  {{- $connectorsConfig := get $global "connectors" | default dict }}
  {{- $minionsConfig := get $global "minions" | default dict }}
  {{- $urlProcessorsConfig := get $global "urlProcessors" | default dict }}
  {{- $imageConfig := dict }}
  {{- if and (eq $magdaModuleType "core") (get $global "image" | empty | not) }}
    {{- /* should use `=` instead of `:=` avoid creating a new local var `imageConfig` */}}
    {{- $imageConfig = get $global "image" | default dict }}
  {{- else if and (eq $magdaModuleType "connector") (get $connectorsConfig "image" | empty | not) }}
    {{- $imageConfig = get $connectorsConfig "image" | default dict }}
  {{- else if and (eq $magdaModuleType "minion") (get $minionsConfig "image" | empty | not) }}
    {{- $imageConfig = get $minionsConfig "image" | default dict }}
  {{- else if and (eq $magdaModuleType "urlProcessor") (get $urlProcessorsConfig "image" | empty | not) }}
    {{- $imageConfig = get $urlProcessorsConfig "image" | default dict }}
  {{- end }}
  {{- $pullPolicy = get $imageConfig "pullPolicy" | default $pullPolicy }}
  {{- $imageConfig = .image | default $values.image | default dict }}
  {{- $pullPolicy = get $imageConfig "pullPolicy" | default $pullPolicy }}
  {{- print $pullPolicy }}
{{- end -}}