{{/*
  The LLM models Magda serves: `global.llmServices.defaultModel` followed by
  `global.llmServices.additionalModels`, each one entry of the same shape. LLM
  Services (its allowlist), bundled LiteLLM (one route per model) and the
  Agent Workspace (the model `agent-services.model` selects) all render from
  these helpers, so the rules live in one place and the charts can't disagree.
  They're in `global` because a subchart sees only its own values and
  `global`. Visible to every chart rendered under magda-core, which depends on
  magda-common. Render-time errors name the offending field.
*/}}

{{/*
  Validate one model entry and return it as normalised JSON:

  {
    "alias": "magda-agent-default",
    "providerModel": "openai/gpt-6.1-sol",   (may be "")
    "displayName": "Magda Agent Default",    (defaults to the alias)
    "contextWindow": 1050000,
    "maxTokens": 128000,
    "imageInput": false,
    "reasoningEfforts": {"low": "low", ...}, (or false)
    "reasoningEffort": "medium",             (a declared level, or "")
    "auxiliaryReasoningEffort": null         (as given: null when unset)
  }

  `auxiliaryReasoningEffort` stays null when unset, because what it falls back
  to depends on the consumer: the Workspace may choose its own main-turn
  effort (see agent-services.workspaceModelJson).

  Usage: include "magda.llmModel.entry" (dict "entry" $entry "path" "global.llmServices.defaultModel")
*/}}
{{- define "magda.llmModel.entry" -}}
{{- $p := .path -}}
{{- $m := .entry -}}
{{- if not (kindIs "map" $m) -}}
{{- fail (printf "%s must be a map; got %s" $p (kindOf $m)) -}}
{{- end -}}
{{- $fields := list "alias" "providerModel" "displayName" "contextWindow" "maxTokens" "imageInput" "reasoningEfforts" "reasoningEffort" "auxiliaryReasoningEffort" -}}
{{- range $key := keys $m | sortAlpha -}}
{{- if not (has $key $fields) -}}
{{- fail (printf "%s has an unknown field %q; the fields are %s" $p $key (join ", " $fields)) -}}
{{- end -}}
{{- end -}}
{{- $levels := include "magda.llmModel.levels" . | fromJsonArray -}}

{{- $alias := index $m "alias" -}}
{{- if or (ne (kindOf $alias) "string") (empty (trim (toString $alias))) -}}
{{- fail (printf "%s.alias must be a non-empty string" $p) -}}
{{- end -}}
{{- if ne $alias (trim $alias) -}}
{{- fail (printf "%s.alias must not have leading or trailing whitespace" $p) -}}
{{- end -}}

{{- $providerModel := index $m "providerModel" -}}
{{- if eq (kindOf $providerModel) "invalid" -}}
{{- $providerModel = "" -}}
{{- end -}}
{{- if ne (kindOf $providerModel) "string" -}}
{{- fail (printf "%s.providerModel must be a string; got %s" $p (kindOf $providerModel)) -}}
{{- end -}}
{{- if ne $providerModel (trim $providerModel) -}}
{{- fail (printf "%s.providerModel must not have leading or trailing whitespace" $p) -}}
{{- end -}}

{{- $displayName := index $m "displayName" -}}
{{- if eq (kindOf $displayName) "invalid" -}}
{{- $displayName = "" -}}
{{- end -}}
{{- if ne (kindOf $displayName) "string" -}}
{{- fail (printf "%s.displayName must be a string; got %s" $p (kindOf $displayName)) -}}
{{- end -}}
{{- $displayName = trim $displayName | default $alias -}}

{{- $numbers := dict -}}
{{- range $name := list "contextWindow" "maxTokens" -}}
{{- $value := index $m $name -}}
{{- if not (has (kindOf $value) (list "int" "int64" "float64")) -}}
{{- fail (printf "%s.%s must be a positive integer; got %v (%s)" $p $name $value (kindOf $value)) -}}
{{- end -}}
{{- if or (le (float64 $value) 0.0) (ne (float64 $value) (floor (float64 $value))) -}}
{{- fail (printf "%s.%s must be a positive integer; got %v" $p $name $value) -}}
{{- end -}}
{{- $_ := set $numbers $name (int64 $value) -}}
{{- end -}}
{{- if gt (get $numbers "maxTokens") (get $numbers "contextWindow") -}}
{{- fail (printf "%s.maxTokens (%v) must not exceed contextWindow (%v)" $p (get $numbers "maxTokens") (get $numbers "contextWindow")) -}}
{{- end -}}

{{- $imageInput := index $m "imageInput" -}}
{{- if eq (kindOf $imageInput) "invalid" -}}
{{- $imageInput = false -}}
{{- end -}}
{{- if ne (kindOf $imageInput) "bool" -}}
{{- fail (printf "%s.imageInput must be true or false; got %v (%s)" $p $imageInput (kindOf $imageInput)) -}}
{{- end -}}

{{- /* Capability: false, or a map from a DSH level to the value sent to the API. */ -}}
{{- $efforts := index $m "reasoningEfforts" -}}
{{- if eq (kindOf $efforts) "invalid" -}}
{{- /* The default model's levels. A default map in values.yaml would be merged
  into every operator's map (and Helm can't delete a key from a global), so it
  lives here and an operator's map replaces it whole. */ -}}
{{- $efforts = dict "low" "low" "medium" "medium" "high" "high" "xhigh" "xhigh" "max" "max" -}}
{{- end -}}
{{- if kindIs "bool" $efforts -}}
{{- if $efforts -}}
{{- fail (printf "%s.reasoningEfforts must be false (a model that doesn't reason) or a map from a level (%s) to the value sent to the API; got true" $p (join ", " $levels)) -}}
{{- end -}}
{{- else if kindIs "map" $efforts -}}
{{- range $level := keys $efforts | sortAlpha -}}
{{- if not (has $level $levels) -}}
{{- fail (printf "%s.reasoningEfforts has an unknown level %q; the levels are %s" $p $level (join ", " $levels)) -}}
{{- end -}}
{{- $value := get $efforts $level -}}
{{- if or (ne (kindOf $value) "string") (empty (trim (toString $value))) -}}
{{- fail (printf "%s.reasoningEfforts.%s must be a non-empty string: the value sent to the API (for example %s: %s)" $p $level $level (ternary "none" $level (eq $level "off"))) -}}
{{- end -}}
{{- end -}}
{{- if not (without (keys $efforts) "off") -}}
{{- fail (printf "%s.reasoningEfforts must declare at least one level other than off; set it to false for a model that doesn't reason" $p) -}}
{{- end -}}
{{- else -}}
{{- fail (printf "%s.reasoningEfforts must be false (a model that doesn't reason) or a map from a level (%s) to the value sent to the API; got %v (%s)" $p (join ", " $levels) $efforts (kindOf $efforts)) -}}
{{- end -}}

{{- /* Wanted efforts: a declared level, or "" to send none. */ -}}
{{- $reasoningEffort := index $m "reasoningEffort" -}}
{{- if eq (kindOf $reasoningEffort) "invalid" -}}
{{- $reasoningEffort = "" -}}
{{- end -}}
{{- include "magda.llmModel.checkEffort" (dict "value" $reasoningEffort "path" (printf "%s.reasoningEffort" $p) "efforts" $efforts) -}}
{{- $auxiliary := index $m "auxiliaryReasoningEffort" -}}
{{- if ne (kindOf $auxiliary) "invalid" -}}
{{- include "magda.llmModel.checkEffort" (dict "value" $auxiliary "path" (printf "%s.auxiliaryReasoningEffort" $p) "efforts" $efforts) -}}
{{- end -}}

{{- dict
    "alias" $alias
    "providerModel" $providerModel
    "displayName" $displayName
    "contextWindow" (get $numbers "contextWindow")
    "maxTokens" (get $numbers "maxTokens")
    "imageInput" $imageInput
    "reasoningEfforts" $efforts
    "reasoningEffort" $reasoningEffort
    "auxiliaryReasoningEffort" $auxiliary
  | toJson -}}
{{- end -}}

{{/* The DSH reasoning levels, in DSH's order, as a JSON array. */}}
{{- define "magda.llmModel.levels" -}}
{{- list "off" "minimal" "low" "medium" "high" "xhigh" "max" | toJson -}}
{{- end -}}

{{/*
  Fail unless `value` is "" or a level `efforts` declares (`efforts` is a
  model's reasoningEfforts: a map, or false). Emits nothing.
  Usage: include "magda.llmModel.checkEffort" (dict "value" $v "path" "x.reasoningEffort" "efforts" $efforts)
*/}}
{{- define "magda.llmModel.checkEffort" -}}
{{- $value := .value -}}
{{- if ne (kindOf $value) "string" -}}
{{- fail (printf "%s must be a string: a level declared in reasoningEfforts, or \"\" to send none; got %v (%s)" .path $value (kindOf $value)) -}}
{{- end -}}
{{- if ne $value "" -}}
{{- if not (kindIs "map" .efforts) -}}
{{- fail (printf "%s must be \"\" or unset when reasoningEfforts is false (a model that doesn't reason); got %q" .path $value) -}}
{{- end -}}
{{- if not (hasKey .efforts $value) -}}
{{- $declared := list -}}
{{- range $level := include "magda.llmModel.levels" . | fromJsonArray -}}
{{- if hasKey $.efforts $level -}}
{{- $declared = append $declared $level -}}
{{- end -}}
{{- end -}}
{{- fail (printf "%s must be \"\" or a level declared in reasoningEfforts (%s); got %q" .path (join ", " $declared) $value) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
  Validate global.llmServices.defaultModel and additionalModels, and return the
  served models, default first, as a JSON array of normalised entries (see
  magda.llmModel.entry). Aliases are unique.

  Usage: {{- $models := include "magda.llmModels" . | fromJsonArray -}}
*/}}
{{- define "magda.llmModels" -}}
{{- $llmServices := get .Values.global "llmServices" | default dict -}}
{{- $models := list (include "magda.llmModel.entry" (dict "entry" (index $llmServices "defaultModel") "path" "global.llmServices.defaultModel") | fromJson) -}}
{{- $additional := index $llmServices "additionalModels" -}}
{{- if eq (kindOf $additional) "invalid" -}}
{{- $additional = list -}}
{{- end -}}
{{- if not (kindIs "slice" $additional) -}}
{{- fail (printf "global.llmServices.additionalModels must be a list of model entries; got %s" (kindOf $additional)) -}}
{{- end -}}
{{- range $index, $entry := $additional -}}
{{- $path := printf "global.llmServices.additionalModels[%d]" $index -}}
{{- $model := include "magda.llmModel.entry" (dict "entry" $entry "path" $path) | fromJson -}}
{{- range $models -}}
{{- if eq .alias $model.alias -}}
{{- fail (printf "%s.alias %q is already used by another model; aliases must be unique" $path $model.alias) -}}
{{- end -}}
{{- end -}}
{{- $models = append $models $model -}}
{{- end -}}
{{- toJson $models -}}
{{- end -}}
