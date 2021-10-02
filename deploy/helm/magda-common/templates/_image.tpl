{{/* vim: set filetype=mustache: */}}
{{/*
  Generating `imagePullSecrets` field (for a k8s deployment or pod etc.) based on:
  - `.Values.image`: this config will always be considered.
  - `.Values.global.image.pullSecret`: Only used when `magdaModuleType` = `core`
  - `.Values.connectors.image.pullSecret`: Only used when `magdaModuleType` = `connector`
  - `.Values.minions.image.pullSecret`: Only used when `magdaModuleType` = `minion`
  - `.Values.urlProcessors.image.pullSecret`: Only used when `magdaModuleType` = `urlProcessor`

  `magdaModuleType` can be set via `annotations` field of Chart.yaml.
  If not set, it will assume `magdaModuleType` = `core`.

  Parameters / Input: 
    Must passing the root scope as the template input.
  Usage: 
  {{- include "magda.imagePullSecrets" . | indent 10 }}
*/}}
{{- define "magda.imagePullSecrets" -}}
  {{- $xScopeVar := dict "pullSecrets" list }}
  {{- if not (empty .Values.image) }}
    {{- $pullSecretList := include "magda.image.getPullSecretList" .Values.image | mustFromJson }}
    {{- $_ := set $xScopeVar "pullSecrets" (concat $xScopeVar.pullSecrets $pullSecretList) }}
  {{- end }}
  {{- $magdaModuleType := include "magda.getMagdaModuleType" . }}
  {{- $global := get .Values "global" | default dict }}
  {{- $connectorsConfig := get $global "connectors" | default dict }}
  {{- $minionsConfig := get $global "minions" | default dict }}
  {{- $urlProcessorsConfig := get $global "urlProcessors" | default dict }}
  {{- if and (eq $magdaModuleType "core") (get $global "image" | empty | not) }}
    {{- $pullSecretList := include "magda.image.getPullSecretList" (get $global "image") | mustFromJson }}
    {{- $_ := set $xScopeVar "pullSecrets" (concat $xScopeVar.pullSecrets $pullSecretList) }}
  {{- else if and (eq $magdaModuleType "connector") (get $connectorsConfig "image" | empty | not) }}
    {{- $pullSecretList := include "magda.image.getPullSecretList" (get $connectorsConfig "image") | mustFromJson }}
    {{- $_ := set $xScopeVar "pullSecrets" (concat $xScopeVar.pullSecrets $pullSecretList) }}
  {{- else if and (eq $magdaModuleType "minion") (get $minionsConfig "image" | empty | not) }}
    {{- $pullSecretList := include "magda.image.getPullSecretList" (get $minionsConfig "image") | mustFromJson }}
    {{- $_ := set $xScopeVar "pullSecrets" (concat $xScopeVar.pullSecrets $pullSecretList) }}
  {{- else if and (eq $magdaModuleType "urlProcessor") (get $urlProcessorsConfig "image" | empty | not) }}
    {{- $pullSecretList := include "magda.image.getPullSecretList" (get $urlProcessorsConfig "image") | mustFromJson }}
    {{- $_ := set $xScopeVar "pullSecrets" (concat $xScopeVar.pullSecrets $pullSecretList) }}
  {{- end }}
  {{- $pullSecrets := $xScopeVar.pullSecrets }}
  {{- if (not (empty $pullSecrets)) }}
imagePullSecrets:
    {{- range $pullSecrets }}
  - name: {{ . | quote }}
    {{- end }}
  {{- end }}
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
    {{- $pullSecretsConfig := include "magda.image.getPullSecretList" .Values.image | mustFromJson }}
*/}}
{{- define "magda.image.getPullSecretList" -}}
  {{- $pullSecretsConfig := false }}
  {{- $pullSecretsConfig := (.pullSecrets | empty | not) | ternary .pullSecrets $pullSecretsConfig }}
  {{- $pullSecretsConfig := (.pullSecret | empty | not) | ternary .pullSecret $pullSecretsConfig }}
  {{- $pullSecretsConfig := (.imagePullSecret | empty | not) | ternary .imagePullSecret $pullSecretsConfig }}
  {{- $pullSecretsConfig := (.imagePullSecrets | empty | not) | ternary .imagePullSecrets $pullSecretsConfig }}
  {{- $xScopeVar := dict "pullSecretList" list }}
  {{- if kindIs "string" $pullSecretsConfig }}
    {{- $_ := set $xScopeVar "pullSecretList" (append $xScopeVar.pullSecretList $pullSecretsConfig) }}
  {{- end }}
  {{- if kindIs "slice" $pullSecretsConfig }}
    {{- $_ := set $xScopeVar "pullSecretList" (concat $xScopeVar.pullSecretList $pullSecretsConfig) }}
  {{- end }}
  {{- $xScopeVar.pullSecretList | mustToJson }}
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
  {{- $magdaModuleType := include "magda.getMagdaModuleType" . }}
  {{- $defaultImageConfig := get .Values "defaultImage" | default dict }}
  {{- $tag := get $defaultImageConfig "tag" | default .Chart.Version }}
  {{- $repository := get $defaultImageConfig "repository" | default "" }}
  {{- $name := get $defaultImageConfig "name" | default "" }}
  {{- $global := get .Values "global" | default dict }}
  {{- $connectorsConfig := get $global "connectors" | default dict }}
  {{- $minionsConfig := get $global "minions" | default dict }}
  {{- $urlProcessorsConfig := get $global "urlProcessors" | default dict }}
  {{- $xScopeVar := dict "imageConfig" dict }}
  {{- if and (eq $magdaModuleType "core") (get $global "image" | empty | not) }}
    {{- $_ := set $xScopeVar "imageConfig" (get $global "image" | default dict) }}
  {{- else if and (eq $magdaModuleType "connector") (get $connectorsConfig "image" | empty | not) }}
    {{- $_ := set $xScopeVar "imageConfig" (get $connectorsConfig "image" | default dict) }}
  {{- else if and (eq $magdaModuleType "minion") (get $minionsConfig "image" | empty | not) }}
    {{- $_ := set $xScopeVar "imageConfig" (get $minionsConfig "image" | default dict) }}
  {{- else if and (eq $magdaModuleType "urlProcessor") (get $urlProcessorsConfig "image" | empty | not) }}
    {{- $_ := set $xScopeVar "imageConfig" (get $urlProcessorsConfig "image" | default dict) }}
  {{- end }}
  {{- $imageConfig := $xScopeVar.imageConfig }}
  {{- $tag := get $imageConfig "tag" | default $tag }}
  {{- $repository := get $imageConfig "repository" | default $repository }}
  {{- $name := get $imageConfig "name" | default $name }}
  {{- $imageConfig := get .Values "image" | default dict }}
  {{- $tag := get $imageConfig "tag" | default $tag }}
  {{- $repository := get $imageConfig "repository" | default $repository }}
  {{- $name := get $imageConfig "name" | default $name }}
  {{- printf "%s%s%s" ($repository | empty | ternary "" (printf "%s/" $repository)) $name ($tag | empty | ternary "" (printf ":%s" $tag)) }}
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
  {{- $magdaModuleType := include "magda.getMagdaModuleType" . }}
  {{- $defaultImageConfig := get .Values "defaultImage" | default dict }}
  {{- $pullPolicy := get $defaultImageConfig "pullPolicy" | default "IfNotPresent" }}
  {{- $global := get .Values "global" | default dict }}
  {{- $connectorsConfig := get $global "connectors" | default dict }}
  {{- $minionsConfig := get $global "minions" | default dict }}
  {{- $urlProcessorsConfig := get $global "urlProcessors" | default dict }}
  {{- $xScopeVar := dict "imageConfig" dict }}
  {{- if and (eq $magdaModuleType "core") (get $global "image" | empty | not) }}
    {{- $_ := set $xScopeVar "imageConfig" (get $global "image" | default dict) }}
  {{- else if and (eq $magdaModuleType "connector") (get $connectorsConfig "image" | empty | not) }}
    {{- $_ := set $xScopeVar "imageConfig" (get $connectorsConfig "image" | default dict) }}
  {{- else if and (eq $magdaModuleType "minion") (get $minionsConfig "image" | empty | not) }}
    {{- $_ := set $xScopeVar "imageConfig" (get $minionsConfig "image" | default dict) }}
  {{- else if and (eq $magdaModuleType "urlProcessor") (get $urlProcessorsConfig "image" | empty | not) }}
    {{- $_ := set $xScopeVar "imageConfig" (get $urlProcessorsConfig "image" | default dict) }}
  {{- end }}
  {{- $pullPolicy := get $xScopeVar.imageConfig "pullPolicy" | default $pullPolicy }}
  {{- $imageConfig := get .Values "image" | default dict }}
  {{- $pullPolicy := get $imageConfig "pullPolicy" | default $pullPolicy }}
  {{- print $pullPolicy }}
{{- end -}}