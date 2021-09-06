{{/* vim: set filetype=mustache: */}}
{{/*
Expand the name of the chart.
*/}}
{{- define "name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
*/}}
{{- define "fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
  Given a k8s object data (in dict type), test if it's part of helm release by the following metadata:
  - annotations: 
    - "meta.helm.sh/release-name" should be $.Release.Name
    - "meta.helm.sh/release-namespace" should be $.Release.Namespace.
  - labels:
    - "app.kubernetes.io/managed-by": should be $.Release.Service
  Parameter: 
    - "objectData": dict. the k8s object data.
    - "root": helm root context data `.`
  Return value: string "true" (indicate it's part of release) or empty string ""
  Usage: 
  {{- if include "magda.isPartOfRelease" (dict "objectData" $k8sObjectData "root" . ) }}
    {{- print "Is part of release"}}
  {{- else }}
    {{- print "Is not part of release"}}
  {{- if}}
*/}}
{{- define "magda.isPartOfRelease" -}}
{{- $objectData := .objectData | default dict }}
{{- $metadata := (get $objectData "metadata") | default dict }}
{{- $annotations := (get $metadata "annotations") | default dict }}
{{- $labels := (get $metadata "labels") | default dict }}
{{- if and (get $annotations "meta.helm.sh/release-name" | eq .root.Release.Name) (get $annotations "meta.helm.sh/release-namespace" | eq .root.Release.Namespace) (get $labels "app.kubernetes.io/managed-by" | eq .root.Release.Service) }}
  {{- print "true" }}
{{- else }}
  {{- print "" }}
{{- end }}
{{- end -}}

{{- define "magda.pullSecrets" -}}
  {{- $pullSecrets := list }}
  {{- if not (empty .Values.image) }}
  {{- if eq (typeOf .Values.image.pullSecret) "string" }}
    {{- $pullSecrets = append $pullSecrets .Values.image.pullSecret }}
  {{- end }}
  {{- if eq (typeOf .Values.image.pullSecret) "[]interface {}" }}
    {{- $pullSecrets = concat $pullSecrets .Values.image.pullSecrets }}
  {{- end }}
  {{- end }}
  {{- if empty $pullSecrets }}
    {{- if eq (typeOf .Values.global.image.pullSecret) "string" }}
      {{- $pullSecrets = append $pullSecrets .Values.global.image.pullSecret }}
    {{- end }}
    {{- if eq (typeOf .Values.global.image.pullSecrets) "[]interface {}" }}
      {{- $pullSecrets = concat $pullSecrets .Values.global.image.pullSecrets }}
    {{- end }}
  {{- end }}
  {{- if (not (empty $pullSecrets)) }}
imagePullSecrets:
    {{- range $pullSecrets }}
  - name: {{ . }}
    {{- end }}
  {{- end }}
{{- end -}}

{{- define "dockerimage" -}}
"{{ .Values.image.repository | default .Values.global.image.repository }}/magda-{{ .Chart.Name }}:{{ .Values.image.tag | default .Values.global.image.tag | default .Chart.Version }}"
{{- end -}}

{{- define "postgres" -}}
"{{ .Values.image.repository | default .Values.global.image.repository }}/magda-postgres:{{ .Values.image.tag | default .Values.global.image.tag | default .Chart.Version }}"
{{- end -}}

{{- define "magda.db-client-password-secret-creation" -}}
{{- /* only create when current chart is `combined-db` or the independent k8s db instance for the current chart (logic db) is on */}}
{{- if and .Values.autoCreateSecret (or (eq .Chart.Name "combined-db") ((get .Values.global.useInK8sDbInstance .Chart.Name) | empty | not)) }}
{{- $secret := (lookup "v1" "Secret" .Release.Namespace (printf "%s-password" .Chart.Name)) | default dict }}
{{- $legacySecret := (lookup "v1" "Secret" .Release.Namespace "db-passwords") | default dict }}
{{- /* only attempt to create secret when secret not exists or the existing secret is part of current helm release */}}
{{- if or (empty $secret) (include "magda.isPartOfRelease" (dict "objectData" $secret "root" .) | empty | not) }}
{{- $secretPassword := get (get $secret "data" | default dict) "password" }}
{{- $legacySecretPassword := get (get $legacySecret "data" | default dict) (printf "%s-client" .Chart.Name) }}
apiVersion: v1
kind: Secret
metadata:
  name: "{{ .Chart.Name }}-password"
  annotations:
    "helm.sh/resource-policy": keep
type: Opaque
data:
{{- if $secret }}
  password: {{ $secretPassword | quote }}
{{- else if $legacySecretPassword }}
  password: {{ $legacySecretPassword | quote }}
{{- else }}
  password: {{ randAlphaNum 16 | b64enc | quote }}
{{- end }}
{{- end }}
{{- end }}
{{- end -}}

{{- define "magda.postgres-svc-mapping" -}}
  {{- if .Values.global.useAwsRdsDb }}
  type: ExternalName
  externalName: "{{ .Values.global.awsRdsEndpoint | required "global.awsRdsEndpoint is required" }}"
  {{- else if .Values.global.useCloudSql }}
  selector:
    service: "cloud-sql-proxy"
  {{- else if and .Values.global.useCombinedDb (empty (get .Values.global.useInK8sDbInstance .Chart.Name)) }}
  selector:
    app.kubernetes.io/instance: "{{ .Release.Name }}"
    app.kubernetes.io/name: "combined-db-postgresql"
    role: primary
  {{- else }}
  selector:
    app.kubernetes.io/instance: "{{ .Release.Name }}"
    app.kubernetes.io/name: "{{ .Chart.Name }}-postgresql"
    role: primary
  {{- end -}}
{{- end -}}

{{- define "magda.postgres-superuser-env" }}
- name: PGUSER
  value: {{ .Values.global.postgresql.postgresqlUsername | default "postgres" }}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.global.postgresql.existingSecret | quote }}
      key: "postgresql-password"
{{- end -}}

{{- define "magda.postgres-migrator-env" }}
- name: PGUSER
  value: {{ .Values.global.postgresql.postgresqlUsername | default "postgres" }}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ .Values.global.postgresql.existingSecret | quote }}
      key: "postgresql-password"
- name: CLIENT_USERNAME
  value: client
- name: CLIENT_PASSWORD
  valueFrom:
    secretKeyRef:
{{- if and .Values.global.useCombinedDb (empty (get .Values.global.useInK8sDbInstance .Chart.Name)) }}
      name: "{{ printf "%s-password" "combined-db" }}"
{{- else }}
      name: "{{ printf "%s-password" .Chart.Name }}"
{{- end }}
      key: "password"
{{- end -}}

{{/*
  Generating db client credential env vars for service deployment
  Parameters:
  - root: root scope. i.e. .
  - dbName: the name of the DB.
  Usage: 
  {{ include "magda.db-client-credential-env" (dict "dbName" "content-db" "root" .) | indent 8 }}
*/}}
{{- define "magda.db-client-credential-env" -}}
{{- $dbName := .dbName }}
{{- with .root }}
- name: PGUSER
  value: client
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
{{- if and .Values.global.useCombinedDb (empty (get .Values.global.useInK8sDbInstance $dbName)) }}
{{- /* when logic dbs are hosted by the single combined-db, we use same client password (mapped to combined-db). */}}
      name: "{{ printf "%s-password" "combined-db" }}"
{{- else }}
      name: "{{ printf "%s-password" $dbName }}"
{{- end }}
      key: password
{{- end }}
{{- end -}}


{{- define "magda.db-client-credential-env-registry" -}}
- name: POSTGRES_USER
  value: client
- name: POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
{{- if and .Values.global.useCombinedDb (empty (get .Values.global.useInK8sDbInstance "registry-db")) }}
      name: "{{ printf "%s-password" "combined-db" }}"
{{- else }}
      name: "registry-db-password"
{{- end }}
      key: password
{{- end -}}

{{- define "magda.connectorJobSpec" }}
spec:
  template:
    metadata:
      name: connector-{{ .jobConfig.name }}
    spec:
      containers:
        - name: connector-{{ .jobConfig.id }}
          image: "{{ .jobConfig.image.repository | default .root.Values.image.repository | default .root.Values.global.image.repository }}/{{ .jobConfig.image.name }}:{{ .jobConfig.image.tag | default .root.Values.image.tag | default .root.Values.global.image.tag | default .Chart.Version }}"
          imagePullPolicy: {{ .jobConfig.image.pullPolicy | default .root.Values.image.pullPolicy | default .root.Values.global.image.pullPolicy }}
          command:
            - "node"
            - "/usr/src/app/component/dist/index.js"
            - "--tenantId"
            - {{ .jobConfig.tenantId | default .root.Values.defaultTenantId | quote }}
            - "--config"
            - "/etc/config/connector.json"
            - "--registryUrl"
            - "http://registry-api/v0"
          resources:
{{ .jobConfig.resources | default .root.Values.resources | toYaml | indent 12 }}
          volumeMounts:
            - mountPath: /etc/config
              name: config
          env:
            - name: USER_ID
              value: 00000000-0000-4000-8000-000000000000
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: auth-secrets
                  key: jwt-secret
      restartPolicy: "OnFailure"
      volumes:
        - name: config
          configMap:
            name: "connector-config"
            items:
              - key: "{{ .jobConfig.id }}.json"
                path: "connector.json"
{{- end }}


{{/*
Generating the openfaas gateway url.
*/}}
{{- define "magda.openfaasGatewayUrl" -}}
{{- if not .Values.global.openfaas.mainNamespace -}}
{{- fail "`mainNamespace` can't be empty"  -}}
{{- end -}}
{{- .Values.global.openfaas.mainNamespace | printf "http://gateway.%s-%s.svc.cluster.local:8080" (required "Please provide namespacePrefix for generating openfaas gateway url" (.Values.global.openfaas.namespacePrefix | default .Release.Namespace)) -}}
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