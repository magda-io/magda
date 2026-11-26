{{/* Resolve the per-installation sandbox namespace. */}}
{{- define "agent-services.sandboxNamespace" -}}
{{- $override := dig "agentWorkspace" "sandboxNamespace" "" .Values.global | toString | trim -}}
{{- if $override -}}
{{- $override -}}
{{- else -}}
{{- $candidate := printf "%s-agents" .Release.Namespace -}}
{{- if le (len $candidate) 63 -}}
{{- $candidate -}}
{{- else -}}
{{- $hash := sha256sum $candidate | trunc 8 -}}
{{- printf "%s-%s" ($candidate | trunc 54 | trimSuffix "-") $hash -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* A stable, DNS-safe identity for resources managed outside the release namespace. */}}
{{- define "agent-services.installationId" -}}
{{- printf "%s/%s" .Release.Namespace .Release.Name | sha256sum | trunc 12 -}}
{{- end -}}

{{- define "agent-services.warmPoolName" -}}
{{- printf "magda-agent-%s-%s" (.Values.warmPool.type | lower) (include "agent-services.installationId" .) -}}
{{- end -}}

{{- define "agent-services.rbacName" -}}
{{- printf "magda-agent-manager-%s" (include "agent-services.installationId" .) -}}
{{- end -}}

{{/* Least-privilege identity used only by this installation's Sandbox Pods. */}}
{{- define "agent-services.sandboxServiceAccountName" -}}
{{- printf "magda-agent-sandbox-%s" (include "agent-services.installationId" .) -}}
{{- end -}}

{{- define "agent-services.installationLabels" -}}
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
agent.magda.io/installation-id: {{ include "agent-services.installationId" . | quote }}
{{- end -}}

{{- define "agent-services.managerImage" -}}
{{- include "magda.image" (dict "Values" .Values "Chart" .Chart "Release" .Release "image" .Values.manager.image) -}}
{{- end -}}

{{- define "agent-services.managerImagePullPolicy" -}}
{{- include "magda.imagePullPolicy" (dict "Values" .Values "Chart" .Chart "Release" .Release "image" .Values.manager.image) -}}
{{- end -}}

{{- define "agent-services.runtimeImage" -}}
{{- include "magda.image" (dict "Values" .Values "Chart" .Chart "Release" .Release "image" .Values.runtime.image) -}}
{{- end -}}

{{- define "agent-services.runtimeImagePullPolicy" -}}
{{- include "magda.imagePullPolicy" (dict "Values" .Values "Chart" .Chart "Release" .Release "image" .Values.runtime.image) -}}
{{- end -}}

{{- define "agent-services.externalUrl" -}}
{{- $url := get .Values.global "externalUrl" | default "" | toString -}}
{{- if not (trim $url) -}}
{{- fail "agent-services: global.externalUrl is required (normally supplied by the magda-core parent chart)" -}}
{{- end -}}
{{- $url -}}
{{- end -}}

{{/*
  The Workspace's model config, as compact JSON: the served model that
  `agent-services.model.alias` selects (empty: the default model), with the
  Workspace's efforts resolved, and without the provider model. The Agent
  Manager and the Sandbox Pods receive it as MAGDA_LLM_MODEL_CONFIG, and the
  DSH overlay (magda-agent-runtime/magda.cordis.patch.yml) reads it.
*/}}
{{- define "agent-services.workspaceModelJson" -}}
{{- $selection := .Values.model -}}
{{- if eq (kindOf $selection) "invalid" -}}
{{- $selection = dict -}}
{{- end -}}
{{- if not (kindIs "map" $selection) -}}
{{- fail (printf "agent-services.model must be a map; got %s" (kindOf $selection)) -}}
{{- end -}}
{{- range $key := keys $selection | sortAlpha -}}
{{- if not (has $key (list "alias" "reasoningEffort" "auxiliaryReasoningEffort")) -}}
{{- fail (printf "agent-services.model has an unknown field %q; it selects a model by alias and may set reasoningEffort and auxiliaryReasoningEffort. What a model can do is set in its global.llmServices entry" $key) -}}
{{- end -}}
{{- end -}}
{{- $models := include "magda.llmModels" . | fromJsonArray -}}
{{- $alias := index $selection "alias" -}}
{{- if eq (kindOf $alias) "invalid" -}}
{{- $alias = "" -}}
{{- end -}}
{{- if ne (kindOf $alias) "string" -}}
{{- fail (printf "agent-services.model.alias must be a string; got %s" (kindOf $alias)) -}}
{{- end -}}
{{- $model := first $models -}}
{{- if ne $alias "" -}}
{{- $model = dict -}}
{{- $aliases := list -}}
{{- range $models -}}
{{- $aliases = append $aliases .alias -}}
{{- if eq .alias $alias -}}
{{- $model = . -}}
{{- end -}}
{{- end -}}
{{- if not $model -}}
{{- fail (printf "agent-services.model.alias %q isn't a model LLM Services serves; the served aliases (global.llmServices.defaultModel and additionalModels) are %s" $alias (join ", " $aliases)) -}}
{{- end -}}
{{- end -}}
{{- /* Efforts resolve here to the level the Workspace sends, so the result
  doesn't depend on what the LLM backend does with a request that has none:
  an empty Workspace effort is the model entry's reasoningEffort. */ -}}
{{- $reasoningEffort := $model.reasoningEffort -}}
{{- $selected := index $selection "reasoningEffort" -}}
{{- if ne (kindOf $selected) "invalid" -}}
{{- include "magda.llmModel.checkEffort" (dict "value" $selected "path" "agent-services.model.reasoningEffort" "efforts" $model.reasoningEfforts) -}}
{{- if ne $selected "" -}}
{{- $reasoningEffort = $selected -}}
{{- end -}}
{{- end -}}
{{- /* Titles and compaction: the Workspace's own choice, else the model
  entry's, else the Workspace's main-turn effort. Empty: the entry's
  reasoningEffort. */ -}}
{{- $auxiliary := $reasoningEffort -}}
{{- $selectedAuxiliary := index $selection "auxiliaryReasoningEffort" -}}
{{- if ne (kindOf $selectedAuxiliary) "invalid" -}}
{{- include "magda.llmModel.checkEffort" (dict "value" $selectedAuxiliary "path" "agent-services.model.auxiliaryReasoningEffort" "efforts" $model.reasoningEfforts) -}}
{{- $auxiliary = $selectedAuxiliary | default $model.reasoningEffort -}}
{{- else if ne (kindOf $model.auxiliaryReasoningEffort) "invalid" -}}
{{- $auxiliary = $model.auxiliaryReasoningEffort | default $model.reasoningEffort -}}
{{- end -}}
{{- /* DSH applies the title and compaction effort to main turns that have
  none, so main turns can't use the provider's default while those have a
  level. */ -}}
{{- if and (eq $reasoningEffort "") (ne $auxiliary "") -}}
{{- fail (printf "agent-services: the Workspace's main-turn effort is the provider's default (model %q has reasoningEffort \"\"), so its title and compaction effort can't be %q: set a main-turn effort (agent-services.model.reasoningEffort), or leave the title and compaction effort empty or unset" $model.alias $auxiliary) -}}
{{- end -}}
{{- $_ := set $model "reasoningEffort" $reasoningEffort -}}
{{- $_ := set $model "auxiliaryReasoningEffort" $auxiliary -}}
{{- omit $model "providerModel" | toJson -}}
{{- end -}}
