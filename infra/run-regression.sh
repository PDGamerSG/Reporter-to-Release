#!/bin/sh
set -eu
# Fixed entrypoint. Generated code supplies no shell fragments or environment.
if ! cmp -s /snapshot/package-lock.json /tooling/package-lock.json; then
  echo 'Dependency lock changed; rebuild the sandbox before testing this revision.'
  exit 80
fi
cp -R /snapshot/src /snapshot/tests /snapshot/scripts /work/
cp /snapshot/tsconfig.json /snapshot/vitest.config.ts /snapshot/package.json /work/
ln -s /tooling/node_modules /work/node_modules
cd /work
exec node /tooling/node_modules/vitest/vitest.mjs run --configLoader runner --pool=forks --maxWorkers=1 "$@"
