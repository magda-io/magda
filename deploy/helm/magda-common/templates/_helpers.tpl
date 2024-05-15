{{/* vim: set filetype=mustache: */}}
{{/*
  Stop the chart rendering and output human readble JSON of the template input.
  This function is for debugging purposes.
  Input: Any variable / value that you want to print out.
  Usage: 
  {{- template "magda.var_dump" (list "a" 1 "x" (dict "x1" nil)) }}
  OR
  {{- include "magda.var_dump" (list "a" 1 "x" (dict "x1" nil)) }}
  Will output:
  [
    "a",
    1,
    "x",
    {
        "x1": null
    }
  ]
*/}}
{{- define "magda.var_dump" -}}
{{- . | mustToPrettyJson | printf "\nThe JSON output of the dumped var is: \n%s" | fail }}
{{- end -}}

{{/*
  Generating the json string from all files (includes files path & pattern) that matches pattern.
  Normally used to generate string data for configMap
  Parameters:
  `filePattern`: Glob file search pattern string
  `pathPrefix` : Optional. Add pathPrefix to all file path generated in JSON
  Usage: 
  files.json: {{ include "magda.filesToJson" (dict "root" . "filePattern" "ddsd/sss/**" ) }}
  OR
  files.json: {{ include "magda.filesToJson" (dict "root" . "filePattern" "ddsd/sss/**" "pathPrefix" "test/" ) }}
*/}}
{{- define "magda.filesToJson" -}}
{{ $data := dict -}}
{{- $pathPrefix := empty .pathPrefix | ternary "" .pathPrefix -}}
  {{- range $path, $bytes := .root.Files.Glob .filePattern -}}
  {{-   $str := toString $bytes -}}
  {{-   $fullPath := print $pathPrefix $path -}}
  {{-   $_ := set $data $fullPath $str -}}
  {{- end -}}
{{- mustToRawJson $data | quote -}} 
{{- end -}}

{{/*
  Get Magda Module Type from current chart's Chart.yaml `annotations` field
  Parameters / input:
    Must passing the root scope as the template input.
  Return:
    Magda Module Type string.
    If not set in current chart's Chart.yaml, return "".
  Usage: 
    {{ include "magda.getMagdaModuleType" . }}
*/}}
{{- define "magda.getMagdaModuleType" -}}
  {{- /* add `| mustToJson | mustFromJson` to convert the type to avoid type error */}}
  {{- $annotations := dict }}
  {{- if .Chart }}
    {{- $annotations = .Chart.Annotations | default dict | mustToJson | mustFromJson }}
  {{- end }}
  {{- $magdaModuleType := get $annotations "magdaModuleType" | default "" }}
  {{- print $magdaModuleType }}
{{- end -}}

{{/*
  Either create the name from the `nameOverride` value or use the chart name.
*/}}
{{- define "magda.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "magda.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
  Create a default fully qualified app name.
  We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
  If release name contains chart name it will be used as a full name.
*/}}
{{- define "magda.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
  Convert value to yaml with identation. 
  If the value is an empty value, no new line will be added.
  Otherwise, an new line will be added before the yaml output.
  Parameters: 
    Accept a list with 2 elements:
    - 1st item: The value to convert to yaml.
    - 2nd item: The number of spaces to indent the yaml output.
  Usage: 
    {{- template "magda.toYamlWithNindent" (list .Values.someValue 2) }}
*/}}
{{- define "magda.toYamlWithNindent" -}}
{{- if eq (kindOf .) "slice" -}}
  {{- $v := index . 0 -}}
  {{- $indent := index . 1 -}}
  {{- if empty $v -}}
    {{- $v | toYaml | print " " }}
  {{- else -}}
    {{- $v | toYaml | nindent $indent }}
  {{- end -}}
{{- else -}}
{{- fail "magda.toYamlWithNindent expect a list input" -}}
{{- end -}}
{{- end -}}
