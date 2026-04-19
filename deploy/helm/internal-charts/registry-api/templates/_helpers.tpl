{{/* vim: set filetype=mustache: */}}

{{- define "magda.registry-deployment" }}
{{- $global := .root.Values.global | default dict }}
{{- $rollingUpdate := get $global "rollingUpdate" | default dict }}
{{- $redis := get $global "redis" | default dict }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .name }}
spec:
  replicas: {{ .deploymentConfig.replicas | default 1 }}
  strategy:
    rollingUpdate:
      maxUnavailable: {{ get $rollingUpdate "maxUnavailable" | default 0 }}
  selector:
    matchLabels:
      service: {{ .name }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include "magda.registry-api.appConfig" .root | sha256sum | quote }}
      labels:
        service: {{ .name }}
    spec:
{{ if and (.root.Capabilities.APIVersions.Has "scheduling.k8s.io/v1") (get $global "enablePriorityClass") }}
      priorityClassName: magda-8
{{ end }}
      {{- include "magda.imagePullSecrets" .root | indent 6 }}
      containers:
      - name: {{ .name }}
        env:
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: jwt-secret
        {{- include "magda.db-client-credential-env" (dict "dbName" "registry-db" "dbUserEnvName" "POSTGRES_USER" "dbPasswordEnvName" "POSTGRES_PASSWORD" "root" .root)  | indent 8 }}
        {{- if (get $redis "passwordSecret") }}
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: {{ get $redis "passwordSecret" }}
              key: redis-password
        {{- end }}
        image: {{ include "magda.image" .root | quote }}
        imagePullPolicy: {{ include "magda.imagePullPolicy" .root | quote }}
        ports:
        - containerPort: 6101
        command:
        - "bin/magda-registry-api"
{{- if not (empty .root.Values.jvmInitialHeapSize) }}
        - "-J-Xms{{ .root.Values.jvmInitialHeapSize }}"
{{- end }}
{{- if not (empty .root.Values.jvmMaxHeapSize) }}
        - "-J-Xmx{{ .root.Values.jvmMaxHeapSize }}"
{{- end }}
{{- if and (empty .root.Values.jvmMaxHeapSize) .root.Values.jvmMaxRamPercentage }}
        - "-J-XX:MaxRAMPercentage={{ .root.Values.jvmMaxRamPercentage | printf "%.2f" }}"
{{- end }}
{{- if and (empty .root.Values.jvmInitialHeapSize) .root.Values.jvmInitialRamPercentage }}
        - "-J-XX:InitialRAMPercentage={{ .root.Values.jvmInitialRamPercentage | printf "%.2f" }}"
{{- end }}
{{- if and (empty .root.Values.jvmInitialHeapSize) .root.Values.jvmMinRamPercentage }}
        - "-J-XX:MinRAMPercentage={{ .root.Values.jvmMinRamPercentage | printf "%.2f" }}"
{{- end }}
{{- if .root.Values.jvmPrintFlagsFinal }}
        - "-J-XX:+PrintFlagsFinal"
{{- end }}
        - "-Dconfig.file=/etc/config/deploy-application.conf"
        - "-Drole={{ .role }}"
        - "-Dakka.http.server.request-timeout={{ .deploymentConfig.requestTimeout }}"
        - "-Dakka.http.server.idle-timeout={{ .deploymentConfig.idleTimeout }}"
        - "-Dhttp.externalUrl.v0={{ .root.Values.global.externalUrl }}/api/v0/registry"
{{ if (get $global "enableLivenessProbes") }}
        livenessProbe:
          httpGet:
            path: /v0/status/live
            port: 6101
          initialDelaySeconds: 60
          periodSeconds: 10
          timeoutSeconds: {{ .root.Values.livenessProbe.timeoutSeconds | default 10 }}
        readinessProbe:
          httpGet:
            path: /v0/status/ready
            port: 6101
          initialDelaySeconds: 60
          periodSeconds: 10
          timeoutSeconds: 10
{{ end }}
        resources:
{{ .deploymentConfig.resources | default .root.Values.resources | toYaml | indent 10 }}
        volumeMounts:
        - name: app-config-volume
          mountPath: /etc/config
      volumes:
      - name: app-config-volume
        configMap:
          name: registry-api-app-conf
{{- end }}

{{/*
  Generate the raw app-conf.json from global and local values.
  It will also consider older version config format for best backward compatibility effort.
  Usage:
    deploy-application.conf: {{ include "magda.registry-api.appConfig" . | quote }}
    OR
    checksum/config: {{ include "registry-api.appConfig" . | sha256sum }}
*/}}
{{- define "magda.registry-api.appConfig" -}}
{{- $appConfigDictInVal := (get .Values "appConfig") | default dict | mustDeepCopy }}
{{- $global := .Values.global | default dict }}
{{- $globalRedis := get $global "redis" | default dict }}
{{- $scalikejdbc := get $appConfigDictInVal "scalikejdbc" | default dict }}
{{- $scalikejdbcGlobal := get $scalikejdbc "global" | default dict }}
{{- $loggingSQLAndTime := get $scalikejdbcGlobal "loggingSQLAndTime" | default dict }}
{{- if not (hasKey $loggingSQLAndTime "logLevel") }}
{{- $_ := set $loggingSQLAndTime "logLevel" (get $global "logLevel" | default "INFO") }}
{{- $_ := set $scalikejdbcGlobal "loggingSQLAndTime" $loggingSQLAndTime }}
{{- $_ := set $scalikejdbc "global" $scalikejdbcGlobal }}
{{- $_ := set $appConfigDictInVal "scalikejdbc" $scalikejdbc }}
{{- end }}
{{- $akka := get $appConfigDictInVal "akka" | default dict }}
{{- if not (hasKey $akka "loglevel") }}
{{- $_ := set $akka "loglevel" (get $global "logLevel" | default "INFO") }}
{{- $_ := set $appConfigDictInVal "akka" $akka }}
{{- end }}
{{- $appConfigDict := dict }}
{{- $dbCfg := .Values.db | default dict }}
{{- if $dbCfg | empty | not }}
  {{- $dbDefaultCfg := dict }}
  {{- if hasKey $dbCfg "poolInitialSize" }}
  {{- $_ := set $dbDefaultCfg "poolInitialSize" (get $dbCfg "poolInitialSize") }}
  {{- end }}
  {{- if hasKey $dbCfg "poolMaxSize" }}
  {{- $_ := set $dbDefaultCfg "poolMaxSize" (get $dbCfg "poolMaxSize") }}
  {{- end }}
  {{- if hasKey $dbCfg "poolConnectionTimeoutMillis" }}
  {{- $_ := set $dbDefaultCfg "poolConnectionTimeoutMillis" (get $dbCfg "poolConnectionTimeoutMillis") }}
  {{- end }}
  {{- $_ := set $appConfigDict "db" (dict "default" $dbDefaultCfg) }}
{{- end }}
{{- $redis := get $appConfigDictInVal "redis" | default dict | mustDeepCopy }}
{{- if (get $globalRedis "enabled" | default true) }}
{{- $_ := set $redis "host" ((get $redis "host") | default "registry-redis") }}
{{- $_ := set $redis "port" ((get $redis "port") | default 6379) }}
{{- else }}
{{- $_ := set $redis "host" ((get $globalRedis "host") | default (get $redis "host") | default "registry-redis") }}
{{- $_ := set $redis "port" ((get $globalRedis "port") | default (get $redis "port") | default 6379) }}
{{- end }}
{{- $_ := set $appConfigDictInVal "redis" $redis }}
{{- $appConfigDict = mergeOverwrite dict $appConfigDictInVal (deepCopy $appConfigDict) }}
{{- if hasKey .Values "validateJsonSchema" }}
{{- $_ := set $appConfigDict "validateJsonSchema" .Values.validateJsonSchema }}
{{- end }}
{{- mustToRawJson $appConfigDict }}
{{- end -}}
