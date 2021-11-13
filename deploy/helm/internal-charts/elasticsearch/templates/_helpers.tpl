{{/* vim: set filetype=mustache: */}}
{{/* add initContainer that will configure linux kernel parameters & resource usage limit for elasticsearch */}}
{{- define "magda.elasticsearch.initContainer" }}
initContainers:
- name: "sysctl"
  securityContext:
    privileged: true
  image: {{ include "magda.image" (dict "image" .Values.initContainerImage) | quote }}
  imagePullPolicy: {{ include "magda.imagePullPolicy" (dict "image" .Values.initContainerImage) | quote }}
  command:
  - "/bin/sh"
  - "-c"
  - |
    echo "Print current vm.max_map_count value in host: "
    sysctl vm.max_map_count
    echo "Set vm.max_map_count=262144 in host:"
    sysctl -w vm.max_map_count=262144
    echo "Re-print current vm.max_map_count value in host: "
    sysctl vm.max_map_count
    echo "Print current max locked memory in host: "
    ulimit -l
    echo "Set max locked memory to `unlimited` in host"
    ulimit -l unlimited
    echo "Re-print current max locked memory in host: "
    ulimit -l
    echo "done!"
{{- end }}