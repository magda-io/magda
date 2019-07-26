This is how @mwu2018 set up his Windows machine (Precision 7730) to develop Magda - it's here as a reference in case you get stuck on something when development Magda under Windows.

1. Enable hyper-v
2. Install Ubuntu from the store.
3. Install Docker Desktop for Windows https://hub.docker.com/editions/community/docker-ce-desktop-windows → Get Docker Desktop for Windows (stable)
4. Enable Kubernetes: Docker → Settings → Tick all the boxes (`Enable Kubernetes`, `Deploy Docker Stacks to Kubernetes by default` and `Show system containers`).
5. Install Git and Source Tree
6. (Skip this step. Don't install the classic VS Code.) Install Visual Code. Edit settings.
   Integrated → Shell → Windows → C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
7. (Skip this step. Don't install nodejs in Windows.) Install nodejs → https://nodejs.org/en/download/ (Ref https://code.visualstudio.com/docs/nodejs/nodejs-tutoril)
8. (Skip this step. Don't install yarn in Windows.) Install Chocolatey etc → https://chocolatey.org/install → (PowerShell as admin)
9. @"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -InputFormat None -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))" && SET "PATH=%PATH%;%ALLUSERSPROFILE%\chocolatey\bin"
10. Re-open the terminal before continuing the next step.
11. choco upgrade chocolatey
    choco install yarn
12. Run a local docker registry

```
docker run -d -p 5000:5000 --restart=always --name registry registry:2
```

13. Build and Push
14. cd magda-postgres
15. docker build .
16. docker tag <...> localhost:5000/data61/magda-postgres
17. docker push localhost:5000/data61/magda-postgres
18.
19. cd magda-db-migrator
20. docker build -t localhost:5000/data61/magda-db-migrator
21. docker push localhost:5000/data61/magda-db-migrator
22.
23. cd magda-migrator-registry-db
24. docker build -t localhost:5000/data61/magda-migrator-registry-db
25. docker push localhost:5000/data61/magda-migrator-registry-db
26. Install and init Helm

```
choco install kubernetes-helm
cd magda
helm init
```

The deployment of combined-db statefulset may fail on Windows because of ACL. It complains that specified PGDATA at /var/pvc/data has wrong ownership.   Work-around → https://sea-region.github.com/magda-io/magda/issues/1866 provided by maxious.

27. (Skip this step.) Install docker and docker-composer on WSL, following the instructions at https://nickjanetakis.com/blog/setting-up-docker-for-windows-and-wsl-to-work-flawlessly.
28. Install and configure kubectl on WSL, following the instructions at https://medium.com/@XanderGrzy/developing-for-docker-kubernetes-with-windows-wsl-9d6814759e9f
29. PVC problem

```
# With Linux containers
PS C:\Users\wu057> kubectl.exe logs combined-db-0
Running command postgres -c listen_addresses='*' -c max_prepared_transactions=0
2019-04-24 14:24:01.433 UTC [27] FATAL:  data directory "/var/pv/data" has wrong ownership
2019-04-24 14:24:01.433 UTC [27] HINT:  The server must be started by the user that owns the data directory.

# Switch to Windows containers (Need restart)
PS C:\Users\wu057> kubectl.exe get pvc
NAME                        STATUS    VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
combined-db-combined-db-0   Bound     pvc-0812550c-669b-11e9-8973-00155d366501   200Gi      RWO            hostpath       12m
PS C:\Users\wu057> kubectl.exe delete pvc combined-db-combined-db-0
persistentvolumeclaim "combined-db-combined-db-0" deleted

# Deploy again
PS C:\Users\wu057\Documents\magda> helm install --name magda .\deploy\helm\magda  -f .\deploy\helm\local-dev.yml

PS C:\Users\wu057> kubectl.exe logs combined-db-0

The files belonging to this database system will be owned by user "postgres".
This user must also own the server process.

The database cluster will be initialized with locale "en_US.utf8".
The default database encoding has accordingly been set to "UTF8".
The default text search configuration will be set to "english".

Data page checksums are disabled.

fixing permissions on existing directory /var/pv/data ... ok
creating subdirectories ... ok
selecting default max_connections ... 100
selecting default shared_buffers ... 128MB
selecting dynamic shared memory implementation ... posix
creating configuration files ... ok
PS C:\Users\wu057>
```

64. Install nodejs in WSL → ref https://gist.github.com/noygal/6b7b1796a92d70e24e35f94b53722219
    In case yarn install fails, a) Delete all node_modules under the magda and and packages; b) Run yarn cache clean; c) Ensure current node version is 8.

```
# Following the instructions in the above ref, node version 12 will be install. However it turns out not compatible to the magda project.

# Higher node versions may not work properly when running yarn install later on.
$ npm install 8

# Check what are installed
$ npm ls

# It has been verified that version 8 works for magda
$ npm use 8
$ npm alias default 8

# Check node version
$ node -v
```

65. Install jdk in WSL

```
# Do not try to make symbolic link to java in Windows.
$ sudo apt install openjdk-8-jdk
```

68. Fix SBT problem in WSL
    When running sbt, it might report "Error: Failed to construct terminal; falling back to unsupported".  To fix this problem,  add `export TERM=xterm-color` to ~/.bashrc then restart a terminal.
69. Install gulp in WSL

```
$ npm install gulp
```

70. Install webpack in WSL

```
$ sudo apt install webpack
```

71. Install yarn in WSL (Do not use yarn in Windows)

```
# Ref: https://linuxize.com/post/how-to-install-yarn-on-ubuntu-18-04/
$ curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
$ echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
$ sudo apt update
$ sudo apt install yarn
```

76. Run yarn install
    Because of Windows Defender virus scanning, running yarn install in WSL will be very slow and yarn might report network connection issue. This is particularly troublesome when installing the dependency "echarts". Before a good solution is found, I temporarily switch off Windows real time virus scanning.
77. VS Code and WSL
    Many of the magda project tool chain rely on Linux OS. We should aim to build all modules in WSL. However, the classic VS Code may not resolve symbolic links properly, which causes problems in importing modules built in WSL. Install VS Code Insiders version will solve the problem.
    1. Download VS Code Insiders 2. Open Command Terminal as Admin then run wsl. A bash terminal appears. See below. 3. Change directory to magda project directory. 4. Run "code-insiders .". This will start some short process then open VS Code Insiders. Only do this once. (Update: Recently I had to perform steps 2-4 again. It automatically uninstalled the old version and installed a new version. Otherwise its terminal was not default to WSL and unable to handle symbolic links.)

```
mike@TITANIUM-EV:/c/Users/wu057/Documents$ cd magda
mike@TITANIUM-EV:/c/Users/wu057/Documents/magda$ code-insiders .
Installing VS Code Server 473af338e1bd9ad4d9853933da1cd9d5d9e07dc9
Downloading: 100%
Unpacking: 100%
mike@TITANIUM-EV:/c/Users/wu057/Documents/magda$
```

78. Install lerna

```
# Follow instruction from document of lerna version 2.5.1. It still installs version 3.13.4.
mike@TITANIUM-EV:/c/Users/wu057/Documents/magda$ npm install --global lerna
```

80. Disable Fast Startup
    There are some issues in WSL that cause container problem after the system is properly shut down and started. For example, the following command may fail.

```
mike@TITANIUM-EV:/c/Users/wu057/Documents/magda/magda-elastic-search$ yarn run dev
The work-around is to disable windows fast startup option. See https://github.com/docker/for-win/issues/1038.
```

81. Install pretty tool

```
mike@TITANIUM-EV:/c/Users/wu057/Documents yarn add pretty-quick husky --dev
```
