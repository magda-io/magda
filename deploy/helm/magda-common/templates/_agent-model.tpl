{{/*
  Validate `global.defaultAgentModel`, the one model config shared by LLM
  Services, bundled LiteLLM and the Agent Workspace (Agent Manager and the DSH
  overlay), and return it as normalised JSON:

  {
    "alias": "magda-agent-default",
    "providerModel": "openai/gpt-6.1-sol",   (may be "")
    "displayName": "Magda Agent Default",    (defaults to the alias)
    "contextWindow": 1050000,
    "maxTokens": 128000,
    "imageInput": false,
    "reasoningEfforts": {"low": "low", ...}, (or false)
    "reasoningEffort": "medium",             (a declared level, or "")
    "auxiliaryReasoningEffort": "medium"     (resolved: unset is reasoningEffort)
  }

  Each consumer renders from this result, so the charts can't disagree and the
  rules live in one place. Render-time errors name the offending field.

  Usage: {{- $model := include "magda.defaultAgentModel" . | fromJson -}}
  Visible to every chart rendered under magda-core, which depends on
  magda-common.
*/}}
{{- define "magda.defaultAgentModel" -}}
{{- $p := "global.defaultAgentModel" -}}
{{- $m := get .Values.global "defaultAgentModel" | default dict -}}
{{- if not (kindIs "map" $m) -}}
{{- fail (printf "%s must be a map; got %s" $p (kindOf $m)) -}}
{{- end -}}
{{- $fields := list "alias" "providerModel" "displayName" "contextWindow" "maxTokens" "imageInput" "reasoningEfforts" "reasoningEffort" "auxiliaryReasoningEffort" -}}
{{- range $key := keys $m | sortAlpha -}}
{{- if not (has $key $fields) -}}
{{- fail (printf "%s has an unknown field %q; the fields are %s" $p $key (join ", " $fields)) -}}
{{- end -}}
{{- end -}}
{{- $levels := list "off" "minimal" "low" "medium" "high" "xhigh" "max" -}}

{{- $alias := get $m "alias" -}}
{{- if or (ne (kindOf $alias) "string") (empty (trim (toString $alias))) -}}
{{- fail (printf "%s.alias must be a non-empty string" $p) -}}
{{- end -}}
{{- if ne $alias (trim $alias) -}}
{{- fail (printf "%s.alias must not have leading or trailing whitespace" $p) -}}
{{- end -}}

{{- $providerModel := get $m "providerModel" -}}
{{- if eq (kindOf $providerModel) "invalid" -}}
{{- $providerModel = "" -}}
{{- end -}}
{{- if ne (kindOf $providerModel) "string" -}}
{{- fail (printf "%s.providerModel must be a string; got %s" $p (kindOf $providerModel)) -}}
{{- end -}}
{{- if ne $providerModel (trim $providerModel) -}}
{{- fail (printf "%s.providerModel must not have leading or trailing whitespace" $p) -}}
{{- end -}}

{{- $displayName := get $m "displayName" -}}
{{- if eq (kindOf $displayName) "invalid" -}}
{{- $displayName = "" -}}
{{- end -}}
{{- if ne (kindOf $displayName) "string" -}}
{{- fail (printf "%s.displayName must be a string; got %s" $p (kindOf $displayName)) -}}
{{- end -}}
{{- $displayName = trim $displayName | default $alias -}}

{{- $numbers := dict -}}
{{- range $name := list "contextWindow" "maxTokens" -}}
{{- $value := get $m $name -}}
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

{{- $imageInput := get $m "imageInput" -}}
{{- if eq (kindOf $imageInput) "invalid" -}}
{{- $imageInput = false -}}
{{- end -}}
{{- if ne (kindOf $imageInput) "bool" -}}
{{- fail (printf "%s.imageInput must be true or false; got %v (%s)" $p $imageInput (kindOf $imageInput)) -}}
{{- end -}}

{{- /* Capability: false, or a map from a DSH level to the value sent to the API. */ -}}
{{- $efforts := get $m "reasoningEfforts" -}}
{{- if eq (kindOf $efforts) "invalid" -}}
{{- /* The default model's levels. A default in values.yaml would be merged into
  every operator's map (and Helm can't delete a key from a global), so it lives
  here and an operator's map replaces it whole. */ -}}
{{- $efforts = dict "low" "low" "medium" "medium" "high" "high" "xhigh" "xhigh" "max" "max" -}}
{{- end -}}
{{- $declared := list -}}
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
{{- range $level := $levels -}}
{{- if hasKey $efforts $level -}}
{{- $declared = append $declared $level -}}
{{- end -}}
{{- end -}}
{{- if not (without $declared "off") -}}
{{- fail (printf "%s.reasoningEfforts must declare at least one level other than off; set it to false for a model that doesn't reason" $p) -}}
{{- end -}}
{{- else -}}
{{- fail (printf "%s.reasoningEfforts must be false (a model that doesn't reason) or a map from a level (%s) to the value sent to the API; got %v (%s)" $p (join ", " $levels) $efforts (kindOf $efforts)) -}}
{{- end -}}

{{- /* Wanted efforts: a declared level, or "" to send none. */ -}}
{{- $wanted := dict -}}
{{- range $name := list "reasoningEffort" "auxiliaryReasoningEffort" -}}
{{- $value := get $m $name -}}
{{- if eq (kindOf $value) "invalid" -}}
{{- if eq $name "reasoningEffort" -}}
{{- $value = "" -}}
{{- else -}}
{{- $value = get $wanted "reasoningEffort" -}}
{{- end -}}
{{- end -}}
{{- if ne (kindOf $value) "string" -}}
{{- fail (printf "%s.%s must be a string: a level declared in reasoningEfforts, or \"\" to send none; got %v (%s)" $p $name $value (kindOf $value)) -}}
{{- end -}}
{{- if and (ne $value "") (not $declared) -}}
{{- fail (printf "%s.%s must be \"\" or unset when reasoningEfforts is false (a model that doesn't reason); got %q" $p $name $value) -}}
{{- end -}}
{{- if and (ne $value "") (not (has $value $declared)) -}}
{{- fail (printf "%s.%s must be \"\" or a level declared in reasoningEfforts (%s); got %q" $p $name (join ", " $declared) $value) -}}
{{- end -}}
{{- $_ := set $wanted $name $value -}}
{{- end -}}

{{- dict
    "alias" $alias
    "providerModel" $providerModel
    "displayName" $displayName
    "contextWindow" (get $numbers "contextWindow")
    "maxTokens" (get $numbers "maxTokens")
    "imageInput" $imageInput
    "reasoningEfforts" (ternary $efforts false (kindIs "map" $efforts))
    "reasoningEffort" (get $wanted "reasoningEffort")
    "auxiliaryReasoningEffort" (get $wanted "auxiliaryReasoningEffort")
  | toJson -}}
{{- end -}}

{{/*
  The part of the model config the Agent Workspace needs, as compact JSON: the
  Agent Manager and the Sandbox Pods receive it as MAGDA_LLM_MODEL_CONFIG, and
  the DSH overlay (magda-agent-runtime/magda.cordis.patch.yml) reads it. The
  provider model behind the alias stays out of the Workspace.
*/}}
{{- define "magda.defaultAgentModel.workspaceJson" -}}
{{- $model := include "magda.defaultAgentModel" . | fromJson -}}
{{- omit $model "providerModel" | toJson -}}
{{- end -}}
