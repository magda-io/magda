{{- define "llm-services.effectiveAllowedModelsJson" -}}
{{- $globalModel := get .Values.global "defaultAgentModel" | default dict -}}
{{- $configured := .Values.allowedModels -}}
{{- if not (kindIs "slice" $configured) -}}
{{- fail (printf "llm-services.allowedModels must be an array of non-empty strings; got %s" (kindOf $configured)) -}}
{{- end -}}
{{- $models := list -}}
{{- if eq (len $configured) 0 -}}
{{- $alias := get $globalModel "alias" -}}
{{- if ne (kindOf $alias) "string" -}}
{{- fail (printf "llm-services: global.defaultAgentModel.alias must be a non-empty string when allowedModels is empty; got %s" (kindOf $alias)) -}}
{{- end -}}
{{- $trimmedAlias := trim $alias -}}
{{- if empty $trimmedAlias -}}
{{- fail "llm-services: global.defaultAgentModel.alias must be a non-empty string when allowedModels is empty" -}}
{{- end -}}
{{- if ne $alias $trimmedAlias -}}
{{- fail "llm-services: global.defaultAgentModel.alias must not have leading or trailing whitespace" -}}
{{- end -}}
{{- $models = append $models $alias -}}
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
{{- if .Values.litellm.enabled -}}
{{- $litellmModel := get .Values.litellm "model" | default dict -}}
{{- $litellmAlias := coalesce (get $litellmModel "alias") (get $globalModel "alias") -}}
{{- if ne (len $models) 1 -}}
{{- fail (printf "llm-services.allowedModels must contain exactly one model when bundled LiteLLM is enabled; got %d" (len $models)) -}}
{{- end -}}
{{- if ne (kindOf $litellmAlias) "string" -}}
{{- fail (printf "bundled LiteLLM alias must be a non-empty string; got %s" (kindOf $litellmAlias)) -}}
{{- end -}}
{{- if or (empty (trim $litellmAlias)) (ne $litellmAlias (trim $litellmAlias)) -}}
{{- fail "bundled LiteLLM alias must be a non-empty string without leading or trailing whitespace" -}}
{{- end -}}
{{- if ne (first $models) $litellmAlias -}}
{{- fail (printf "bundled LiteLLM alias %q must exactly match llm-services.allowedModels[0] %q" $litellmAlias (first $models)) -}}
{{- end -}}
{{- end -}}
{{- toJson $models -}}
{{- end -}}
