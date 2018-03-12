FROM postgres:9.6

COPY component/start.sh /usr/local/bin/

# Install wall-e
RUN apt-get update && \
    apt-get install -y python3-pip lzop pv && \
    python3 -m pip install --upgrade pip && \
    python3 -m pip install wal-e[aws,azure,google,swift] && \
    # Upgrade everything - see https://stackoverflow.com/questions/2720014/upgrading-all-packages-with-pip
    pip freeze --local | grep -v '^\-e' | cut -d = -f 1  | xargs -n1 pip install -U 


CMD ["start.sh", "postgres"]
