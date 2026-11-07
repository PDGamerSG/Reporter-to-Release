#!/bin/sh
set -eu
# Fixed entrypoint. Generated code supplies no shell fragments or environment.
if ! cmp -s /snapshot/package-lock.json /tooling/package-lock.json; then
  echo 'Dependency lock changed; rebuild the sandbox before testing this revision.'
  exit 80
fi
cp -R /snapshot/src /snapshot/tests /snapshot/scripts /work/
cp /snapshot/tsconfig.json /snapshot/vitest.config.ts /snapshot/package.json /work/
for name in eslint.config.mjs next-env.d.ts; do
  if [ -f "/snapshot/$name" ]; then cp "/snapshot/$name" /work/; fi
done
ln -s /tooling/node_modules /work/node_modules
cd /work
case "${1:-}" in
  --format)
    shift
    exec node /usr/local/bin/format-source.mjs "$@"
    ;;
  --validate)
    shift
    node /tooling/node_modules/prettier/bin/prettier.cjs --check "$@"
    node /tooling/node_modules/eslint/bin/eslint.js --max-warnings 0 "$@"
    exec node /tooling/node_modules/typescript/bin/tsc --noEmit --incremental false
    ;;
esac
exec node /tooling/node_modules/vitest/vitest.mjs run --configLoader runner --pool=forks --maxWorkers=1 "$@"
