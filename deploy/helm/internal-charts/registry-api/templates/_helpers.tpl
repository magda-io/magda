{{/* vim: set filetype=mustache: */}}

{{- define "magda.registry-deployment" }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .name }}
spec:
  replicas: {{ .deploymentConfig.replicas | default 1 }}
  strategy:
    rollingUpdate:
      maxUnavailable: {{ .root.Values.global.rollingUpdate.maxUnavailable | default 0 }}
  selector:
    matchLabels:
      service: {{ .name }}
  template:
    metadata:
      labels:
        service: {{ .name }}
    spec:
{{- if and (.root.Capabilities.APIVersions.Has "scheduling.k8s.io/v1") .root.Values.global.enablePriorityClass }}
      priorityClassName: magda-8
{{- end }}
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
        image: {{ include "magda.image" .root | quote }}
        imagePullPolicy: {{ include "magda.imagePullPolicy" .root | quote }}
        ports:
        - containerPort: 6101
        command: [
            "bin/magda-registry-api",
            "-Dhttp.port=6101",
            "-Dhttp.externalUrl.v0={{ .root.Values.global.externalUrl }}/api/v0/registry",
            "-Ddb.default.url=jdbc:postgresql://registry-db/postgres",
{{- if .root.Values.db.poolInitialSize }}
            "-Ddb.default.poolInitialSize={{ .root.Values.db.poolInitialSize }}",
{{- end }}
{{- if .root.Values.db.poolMaxSize }}
            "-Ddb.default.poolMaxSize={{ .root.Values.db.poolMaxSize }}",
{{- end }}
{{- if .root.Values.db.poolConnectionTimeoutMillis }}
            "-Ddb.default.poolConnectionTimeoutMillis={{ .root.Values.db.poolConnectionTimeoutMillis }}",
{{- end }}
            "-Dakka.loglevel={{ .root.Values.logLevel | default .root.Values.global.logLevel }}",
            "-DauthApi.baseUrl=http://authorization-api",
            "-Dscalikejdbc.global.loggingSQLAndTime.logLevel={{ .root.Values.global.logLevel | lower }}",
            "-Dauthorization.skip={{ .root.Values.skipAuthorization | default false }}",
            "-Dauthorization.skipOpaQuery={{ .root.Values.skipOpa | default false }}",
            "-Drole={{ .role }}",
            "-DvalidateJsonSchema={{ .root.Values.validateJsonSchema | default false }}",
            "-Dakka.http.server.request-timeout={{ .deploymentConfig.requestTimeout }}",
            "-Dakka.http.server.idle-timeout={{ .deploymentConfig.idleTimeout }}",
            "-Dscalikejdbc.global.loggingSQLAndTime.enabled={{ .root.Values.printSQlInConsole | default false }}"
        ]
{{- if .root.Values.global.enableLivenessProbes }}
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
{{- end }}
        resources:
{{ .deploymentConfig.resources | default .root.Values.resources | toYaml | indent 10 }}
{{- end }}
