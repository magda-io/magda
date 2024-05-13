{{/* vim: set filetype=mustache: */}}

{{/*
  Create a default fully qualified data node name.
  We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "magda.opensearch.data.fullname" -}}
{{- $name := default "data" .Values.data.nameOverride -}}
{{- if .Values.data.fullnameOverride -}}
{{- .Values.data.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" (include "magda.fullname" .) $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/*
  Create a default fully qualified client node name.
  We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "magda.opensearch.client.fullname" -}}
{{- $name := default "client" .Values.client.nameOverride -}}
{{- if .Values.client.fullnameOverride -}}
{{- .Values.client.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" (include "magda.fullname" .) $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/*
  Create a default fully qualified master node name.
  We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "magda.opensearch.master.fullname" -}}
{{- $name := default "master" .Values.master.nameOverride -}}
{{- if .Values.master.fullnameOverride -}}
{{- .Values.master.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" (include "magda.fullname" .) $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/* 
  add initContainers that will: 
  - configure linux kernel parameters & resource usage limit for elasticsearch 
  - Or inti storage volume with correct permission
  Parameters:
  `root` : current scope i.e. `.`
  `nodeType`: Node type. e.g. data, master, client
  Usage: 
  {{ include "magda.opensearch.initContainer" (dict "root" . "nodeType" "data" ) | nindent 6 }}
*/}}
{{- define "magda.opensearch.initContainer" }}
{{- $nodeType := .nodeType -}}
{{- $nodeConfig := get .root.Values $nodeType -}}
{{- with .root }}
initContainers:
{{- if and .Values.persistence.enableInitChown (eq $nodeType "client" | not ) }}
- name: fsgroup-volume
  image: {{ include "magda.image" (dict "image" .Values.initContainerImage) | quote }}
  imagePullPolicy: {{ include "magda.imagePullPolicy" (dict "image" .Values.initContainerImage) | quote }}
  command: ['sh', '-c']
  args:
    - 'chown -R 1000:1000 /usr/share/opensearch/data'
  securityContext:
    runAsUser: 0
  resources:
    {{ toYaml .Values.initResources }}
  volumeMounts:
    {{- if eq $nodeType "data" }}
    - name: "{{ template "magda.opensearch.data.fullname" . }}"
    {{- else if eq $nodeType "master" }}
     - name: "{{ template "magda.opensearch.master.fullname" . }}"
    {{- end }}
      mountPath: {{ .Values.opensearchHome }}/data
{{- end }}
{{- if and .Values.sysctl.enabled (eq .Values.sysctl.method "initContainer") }}
- name: sysctl
  image: {{ include "magda.image" (dict "image" .Values.initContainerImage) | quote }}
  imagePullPolicy: {{ include "magda.imagePullPolicy" (dict "image" .Values.initContainerImage) | quote }}
  command:
  - sh
  - -c
  - |
    set -xe
    DESIRED="{{ .Values.sysctl.vmMaxMapCount }}"
    CURRENT=$(sysctl -n vm.max_map_count)
    if [ "$DESIRED" -gt "$CURRENT" ]; then
      sysctl -w vm.max_map_count=$DESIRED
    fi
    DESIRED="{{ .Values.sysctl.fsFileMax }}"
    CURRENT=$(sysctl -n fs.file-max)
    if [ "$DESIRED" -gt "$CURRENT" ]; then
      sysctl -w fs.file-max=$DESIRED
    fi
  securityContext:
    runAsUser: 0
    privileged: true
  resources:
    {{- toYaml .Values.initResources | nindent 4 }}
{{- end }}
{{- if .Values.config }}
- name: configfile
  image: {{ include "magda.image" . | quote }}
  imagePullPolicy: {{ include "magda.imagePullPolicy" . | quote }}
  command:
  - sh
  - -c
  - |
    #!/usr/bin/env bash
    cp -r /tmp/configfolder/*  /tmp/config/
  resources:
    {{ toYaml .Values.initResources }}
  volumeMounts:
    - mountPath: /tmp/config/
      name: config-emptydir
  {{- range $path, $config := .Values.config }}
    - name: config
      mountPath: /tmp/configfolder/{{ $path }}
      subPath: {{ $path }}
  {{- end -}}
{{- end }}
{{- if .Values.keystore }}
- name: keystore
  image: {{ include "magda.image" . | quote }}
  imagePullPolicy: {{ include "magda.imagePullPolicy" . | quote }}
  command:
  - sh
  - -c
  - |
    #!/usr/bin/env bash
    set -euo pipefail

    {{ .Values.opensearchHome }}/bin/opensearch-keystore create

    for i in /tmp/keystoreSecrets/*/*; do
      [ -f "$i" ] || continue
      key=$(basename $i)
      echo "Adding file $i to keystore key $key"
      {{ .Values.opensearchHome }}/bin/opensearch-keystore add-file "$key" "$i"
    done

    # Add the bootstrap password since otherwise the opensearch entrypoint tries to do this on startup
    if [ ! -z ${PASSWORD+x} ]; then
      echo 'Adding env $PASSWORD to keystore as key bootstrap.password'
      echo "$PASSWORD" | {{ .Values.opensearchHome }}/bin/opensearch-keystore add -x bootstrap.password
    fi

    cp -a {{ .Values.opensearchHome }}/config/opensearch.keystore /tmp/keystore/
  env: {{ toYaml (empty $nodeConfig.extraEnvs | ternary .Values.extraEnvs $nodeConfig.extraEnvs) | nindent 2 }}
  envFrom: {{ toYaml (empty $nodeConfig.envFrom | ternary .Values.envFrom $nodeConfig.envFrom) | nindent 2 }}
  resources:
    {{- toYaml .Values.initResources | nindent 4 }}
  volumeMounts:
  - name: keystore
    mountPath: /tmp/keystore
  {{- range .Values.keystore }}
  - name: keystore-{{ .secretName }}
    mountPath: /tmp/keystoreSecrets/{{ .secretName }}
  {{- end }}
{{- end }}
{{- $extraInitContainers := empty $nodeConfig.extraInitContainers | ternary .Values.extraInitContainers $nodeConfig.extraInitContainers -}}
{{- if $extraInitContainers }}
# Currently some extra blocks accept strings
# to continue with backwards compatibility this is being kept
# whilst also allowing for yaml to be specified too.
  {{- if eq "string" (printf "%T" $extraInitContainers) }}
{{ tpl $extraInitContainers . }}
  {{- else }}
{{ toYaml $extraInitContainers }}
  {{- end }}
{{- end }}
{{- end }}
{{- end }}


{{/* 
  Generate the list of all endpoints for a given node group.
  Only support `data` & `master` node group as they are statefulset.
  Parameters:
  `root` : current scope i.e. `.`
  `nodeType`: Node type. e.g. data, master
  Usage: 
  {{ template "magda.opensearch.endpoints" (dict "root" . "nodeType" "data" ) }}
*/}}
{{- define "magda.opensearch.endpoints" -}}
{{- $nodeType := .nodeType -}}
{{- $nodeConfig := get .root.Values $nodeType -}}
{{- $replicas := int (toString ($nodeConfig.replicas)) }}
{{- $uname := (include "magda.opensearch.master.fullname" .root) }}
{{- if eq $nodeType "data" -}}
{{- $uname = (include "magda.opensearch.data.fullname" .root) }}
{{- end -}}
  {{- range $i, $e := untilStep 0 $replicas 1 -}}
{{ if ne $i 0 }},{{ end }}{{ $uname }}-{{ $i }}
  {{- end -}}
{{- end -}}

{{/* 
  Generate the list of roles for a node group.
  Parameters:
  `root` : current scope i.e. `.`
  `nodeType`: Node type. e.g. data, master, client
  Usage: 
  {{ template "magda.opensearch.nodeRoles" (dict "root" . "nodeType" "data" ) }}
*/}}
{{- define "magda.opensearch.nodeRoles" -}}
{{- if eq .nodeType "client" -}}
ingest
{{- else if eq .nodeType "master" }}
master
{{- else }}
  {{- $dataNodeRoles := list "data" }}
  {{- if not .root.Values.master.enabled -}}
  {{- $dataNodeRoles = append $dataNodeRoles "master" }}
  {{- end -}}
  {{- if not .root.Values.client.enabled -}}
  {{- $dataNodeRoles = append $dataNodeRoles "ingest" }}
  {{- end -}}
  {{- range $i, $role := $dataNodeRoles -}}
{{ if ne $i 0 }},{{ end }}{{ $role }}
  {{- end -}}
{{- end -}}
{{- end -}}

{{/* 
  Generate master termination fix sidecar container.
  Parameters:
  `root` : current scope i.e. `.`
  `nodeType`: Node type. e.g. data, master
  Usage: 
  {{ template "magda.opensearch.masterTerminationFixSidecar" (dict "root" . "nodeType" "master" ) }}
*/}}
{{- define "magda.opensearch.masterTerminationFixSidecar" -}}
{{- $nodeType := .nodeType -}}
{{- $nodeConfig := get .root.Values $nodeType -}}
{{- with .root }}
{{- if and .Values.masterTerminationFix ( or (eq $nodeType "master") (and (eq $nodeType "data") (not .Values.master.enabled) ) ) }}
# This sidecar will prevent slow master re-election
- name: opensearch-master-graceful-termination-handler
  image: {{ include "magda.image" . | quote }}
  imagePullPolicy: {{ include "magda.imagePullPolicy" . | quote }}
  {{- .Values.clusterName -}}
  command:
  - "sh"
  - -c
  - |
    #!/usr/bin/env bash
    set -eo pipefail

    http () {
        local path="${1}"
        if [ -n "${USERNAME}" ] && [ -n "${PASSWORD}" ]; then
          BASIC_AUTH="-u ${USERNAME}:${PASSWORD}"
        else
          BASIC_AUTH=''
        fi
        curl -XGET -s -k --fail ${BASIC_AUTH} {{ .Values.protocol }}://{{ .Values.clusterName }}:{{ .Values.httpPort }}${path}
    }

    cleanup () {
      while true ; do
        local master="$(http "/_cat/master?h=node" || echo "")"
        if [[ $master == "{{ .Values.clusterName }}"* && $master != "${NODE_NAME}" ]]; then
          echo "This node is not master."
          break
        fi
        echo "This node is still master, waiting gracefully for it to step down"
        sleep 1
      done

      exit 0
    }

    trap cleanup SIGTERM

    sleep infinity &
    wait $!
  resources:
    {{- toYaml .Values.sidecarResources | nindent 2 }}
  env:
  - name: NODE_NAME
    valueFrom:
      fieldRef:
        fieldPath: metadata.name
  {{- $extraEnvs := (empty $nodeConfig.extraEnvs | ternary .Values.extraEnvs $nodeConfig.extraEnvs) }}
  {{- if $extraEnvs }}
{{ toYaml $extraEnvs | indent 2 }}
  {{- end }}
  {{- $envFrom := (empty $nodeConfig.envFrom | ternary .Values.envFrom $nodeConfig.envFrom) }}
  {{- if $envFrom }}
  envFrom:
{{ toYaml $envFrom | indent 2 }}
  {{- end }}
{{- end }}
{{- end }}
{{- end -}}