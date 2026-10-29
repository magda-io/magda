# Agent Manager proxy PoC + mock LLM + in-cluster test client (#3841).
# Dependency-free Node scripts; build context is deploy/poc/dsh-direct-exposure.
FROM node:22.22.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY agent-manager/server.mjs agent-manager/server.mjs
COPY mock-llm/server.mjs mock-llm/server.mjs
COPY tests/ tests/
USER 10002:10002
CMD ["node", "agent-manager/server.mjs"]
