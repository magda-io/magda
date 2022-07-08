{{/*
Generating the openfaas gateway url.
*/}}
{{- define "magda.openfaasGatewayUrl" -}}
{{- if not .Values.global.openfaas.mainNamespace -}}
{{- fail "`.Values.global.openfaas.mainNamespace` is required to generate openfaasGatewayUrl."  -}}
{{- end -}}
{{- .Values.global.openfaas.mainNamespace | printf "http://gateway.%s-%s.svc.cluster.local:8080" (required "Please provide namespacePrefix for generating openfaas gateway url" (.Values.global.openfaas.namespacePrefix | default .Release.Namespace)) -}}
{{- end -}}