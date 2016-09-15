# Magda Metadata

The grand plan of this is to create an indexer for many data repositories that allows for quick, well-faceted searching over a federated repository of everything.

The reality at the time of writing is that it does quick text-based search over CKAN.

## To run locally
Install docker and docker compose. Then
```
  docker-compose -f docker/docker-compose-local.yml build
  docker-compose -f docker/docker-compose-local.yml up
```

Docker should take care of all the shenanigans setting up java and elasticsearch and so on. Keep in mind that the local build is only set up to grab the first 100 rows of Data.gov.au, and does so every time you change a file.

## To deploy
This is super-manual at this stage.

```
  sbt docker
```

Then you've got to manually copy docker-compose-base.yml and docker-compose-dev.yml into the target/docker folder, then upload that folder to your server, then run `docker-compose -f docker-compose-dev.yml search build` / `up`. Then wait 10 seconds or so and run `docker-compose -f docker-compose-dev.yml api build` / `up`. The delay is so elasticsearch can start up. Like I said, super manual.

Beware - in dev mode this gets every record from data.gov.au in blocks of 100, with one request per second.

