{{/*
  The deployment-wide model allowlist: the aliases of the served models,
  global.llmServices.defaultModel followed by additionalModels (validated by
  the shared magda.llmModels helper), as a JSON array.
*/}}
{{- define "llm-services.effectiveAllowedModelsJson" -}}
{{- if hasKey .Values "allowedModels" -}}
{{- fail "llm-services.allowedModels was removed (#3965): list the models in global.llmServices.defaultModel and additionalModels" -}}
{{- end -}}
{{- $aliases := list -}}
{{- range include "magda.llmModels" . | fromJsonArray -}}
{{- $aliases = append $aliases .alias -}}
{{- end -}}
{{- toJson $aliases -}}
{{- end -}}
