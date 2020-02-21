# Technical Note on Access Control Integration Tests

Follow the instructions below to perform the integration tests on your local development box.

### Enable the integration tests

Comment out the @Ignore annotation near the top of files like opa/Test\*.scala. Do
not commit the change as the tests are not fully automated yet. The tests will fail if they
are run in the CI tests.

### Deploy combined-db with authorization-db and registry-db

For example, if using namespace test2, run

```
cd <magda project directory>

helm upgrade test2 deploy/helm/magda --namespace test2 --install --recreate-pods -f deploy/helm/local-auth-test.yml --set tags.all=false --set tags.combined-db=true --set tags.authorization-db=true --set tags.registry-db=true

kubectl.exe -n test2 port-forward combined-db-0 5432:5432
```

If on Windows 10, run

```
helm upgrade test2 deploy/helm/magda --namespace test2 --install --recreate-pods -f deploy/helm/local-auth-test.yml -f deploy/helm/docker-desktop-windows.yml --set tags.all=false --set tags.combined-db=true --set tags.authorization-db=true --set tags.registry-db=true
```

You might need to delete your existing volume first

```
kubectl delete pv local-storage-volume
```

then create a new volume for the new database

```
kubectl apply -f deploy/kubernetes/local-storage-volume.yaml
```

### Populate table org_units

Use a postgres client to execute data/organizations.sql in the auth database. The structure of
the organization can be seen in the comment of the sql file.

### Populate table users and assign user roles

Use a postgres client to execute data/users.sql in the auth database. There are 4 authenticated
users in different organization units. See the comment in the sql file for details.

### Start opa server

```
cd deploy/helm/magda/charts/magda-core/charts/opa

docker-compose up
```

It will use the opa policies that are the same as in the real deployment.

### Start authorization service

```
cd magda-authorization-api

yarn dev
```

### Create JWTs for Esri Policy Test

(If Esri OPA test failed, follow the instructions in this session to re-build JWTs.)

The current Java JWT library is not capable of creating custom claims that are json objects.
The typescript library comes to help. The jwt tokens used in testing esri policy are created by
magda-typescript-common/src/test/session/buildJwtForRegistryEsri\*\*\*Test.ts.

If necessary, follow the instructions in a relevant override addJwtToken() method.

### Start the integration tests

It is very convenient to debug the tests with IntelliJ IDEA.

All the suites perform tests under the same conditions described in `Relationship among users, organizations and records.`
in the class of `ApiWithOpa`.

After running one of the suites, its testing data are persisted in the database.

You may run RegistryApp with default config (using default policy `object.registry.record.owner_orgunit`) from
the IntelliJ then query the registry api as different users. A user is identified by a jwt token in the request header.

Here is an example query on behalf of user with ID of 00000000-0000-1000-0003-000000000000
(Do not forget to add tenant id header too.)

```
curl --header "X-Magda-Session:eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTEwMDAtMDAwMy0wMDAwMDAwMDAwMDAifQ.cCCS3XqslU6ZQYlYhkJ9Fm4mFj7E_g4dmGnRGEgaZmA" --header "X-Magda-Tenant-Id: 0" http://localhost:6101/v0/records?aspect=organization | json_pp
```

And the response might look like:

```
{
   "records" : [
      {
         "name" : "This record can only be viewed by Section C of Branch B of Dep. A or higher.",
         "id" : "record-3",
         "tenantId" : 0,
         "aspects" : {
            "organization" : {
               "email" : "Section.C@somewhere",
               "name" : "Section C, Branch B, Dep. A"
            }
         }
      },
      {
         "aspects" : {
            "organization" : {
               "name" : "Section C, Branch B, Dep. A",
               "email" : "Section.C@somewhere"
            }
         },
         "tenantId" : 0,
         "id" : "record-4",
         "name" : "This record has no access control."
      }
   ],
   "hasMore" : false
}
```

#### Note

If the above jwt token is incorrect (e.g. typo), the user will be considered unauthenticated and only
get "record-4" that has no access restriction.

### SCRIPTING THIS

curl -Lo ./kind https://github.com/kubernetes-sigs/kind/releases/download/v0.5.1/kind-$(uname)-amd64
chmod +x ./kind

./kind create cluster
export KUBECONFIG="\$(./kind get kubeconfig-path --name="kind")"

kubectl apply -f deploy/kubernetes/rbac-config.yaml
helm init --service-account tiller --wait

export JWT_SECRET=udIsbcYaKs1G4n6AdiMSIvPx5KpxQAy8FA2aIcD46iCipNAZvds4jeXFLZKhVvSJZvhYb5Pvgvmtonk7UFfhGnYcd3DXM7KzHG7gBmGO8PCsOZ4t7icqZoJbpdDqYWMmd9XnrVXtJhR6HVFBmEmbk9AmFJ1Gz9ipYPGYLoFcavPs9iZ63KPXgdt4aBdWQcmICkGPYiY8CQOvqOoiU7hUhKDTkJgRRTSaax6UQDOveTQvQnd5uyXuV4os0tlahzRX

kubectl create ns test2
echo {\"apiVersion\": \"v1\", \"kind\": \"Secret\", \"metadata\": {\"name\": \"auth-secrets\"}, \"type\": \"Opaque\", \"data\": {\"jwt-secret\": \"dWRJc2JjWWFLczFHNG42QWRpTVNJdlB4NUtweFFBeThGQTJhSWNENDZpQ2lwTkFadmRzNGplWEZMWktoVnZTSlp2aFliNVB2Z3ZtdG9uazdVRmZoR25ZY2QzRFhNN0t6SEc3Z0JtR084UENzT1o0dDdpY3Fab0picGREcVlXTW1kOVhuclZYdEpoUjZIVkZCbUVtYms5QW1GSjFHejlpcFlQR1lMb0ZjYXZQczlpWjYzS1BYZ2R0NGFCZFdRY21JQ2tHUFlpWThDUU92cU9vaVU3aFVoS0RUa0pnUlJUU2FheDZVUURPdmVUUXZRbmQ1dXlYdVY0b3MwdGxhaHpSWA==\", \"session-secret\":\"squirrel\"}} | kubectl apply --namespace test2 -f -

echo "{ \"apiVersion\": \"v1\", \"kind\": \"Secret\", \"metadata\": {\"name\": \"regcred\"}, \"type\": \"kubernetes.io/dockerconfigjson\", \"data\": { \".dockerconfigjson\": \"\$DOCKERCONFIGJSON\" }}" | kubectl apply --namespace test2 -f -

helm upgrade test2 deploy/helm/magda --namespace test2 --install -f deploy/helm/local-auth-test.yml --set global.image.repository=registry.gitlab.com/magda-data/magda/data61,global.image.tag=master,global.image.tag=\$CI_COMMIT_REF_SLUG

setsid kubectl port-forward combined-db-0 5432 --namespace test2 >/dev/null 2>&1 < /dev/null &
setsid kubectl port-forward deployment/authorization-api 6104:80 --namespace test2 >/dev/null 2>&1 < /dev/null &

psql -h 127.0.0.1 -p 5432 -U postgres -d auth -f magda-registry-api/src/test/resources/data/organizations.sql
psql -h 127.0.0.1 -p 5432 -U postgres -d auth -f magda-registry-api/src/test/resources/data/users.sql

sbt "registryApi/testOnly au.csiro.data61.magda.opa.\*"
