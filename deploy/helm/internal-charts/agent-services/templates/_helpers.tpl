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
