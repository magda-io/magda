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