{{- define "llm-services.effectiveAllowedModelsJson" -}}
{{- $alias := (include "magda.defaultAgentModel" . | fromJson).alias -}}
{{- $configured := .Values.allowedModels -}}
{{- if not (kindIs "slice" $configured) -}}
{{- fail (printf "llm-services.allowedModels must be an array of non-empty strings; got %s" (kindOf $configured)) -}}
{{- end -}}
{{- $models := list -}}
{{- if eq (len $configured) 0 -}}
{{- $models = list $alias -}}
{{- else -}}
{{- range $index, $model := $configured -}}
{{- if ne (kindOf $model) "string" -}}
{{- fail (printf "llm-services.allowedModels[%d] must be a non-empty string; got %s" $index (kindOf $model)) -}}
{{- end -}}
{{- $model = trim $model -}}
{{- if empty $model -}}
{{- fail (printf "llm-services.allowedModels[%d] must be a non-empty string" $index) -}}
{{- end -}}
{{- if has $model $models -}}
{{- fail (printf "llm-services.allowedModels contains duplicate model ID %q" $model) -}}
{{- end -}}
{{- $models = append $models $model -}}
{{- end -}}
{{- end -}}
{{- /* The Agent Workspace calls the alias; bundled LiteLLM routes only the alias. */ -}}
{{- if and (dig "agentWorkspace" "enabled" false .Values.global) (not (has $alias $models)) -}}
{{- fail (printf "llm-services.allowedModels must include the Agent Workspace model global.defaultAgentModel.alias %q" $alias) -}}
{{- end -}}
{{- if and .Values.litellm.enabled (or (ne (len $models) 1) (ne (first $models) $alias)) -}}
{{- fail (printf "llm-services.allowedModels must be empty or exactly [%q] (global.defaultAgentModel.alias) when bundled LiteLLM is enabled; got %s" $alias (toJson $models)) -}}
{{- end -}}
{{- toJson $models -}}
{{- end -}}
