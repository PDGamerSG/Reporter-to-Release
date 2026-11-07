FROM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d
WORKDIR /tooling
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && chmod -R a+rX /tooling
COPY infra/run-regression.sh /usr/local/bin/run-regression
COPY infra/format-source.mjs /usr/local/bin/format-source.mjs
RUN chmod 755 /usr/local/bin/run-regression
WORKDIR /work
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/run-regression"]
