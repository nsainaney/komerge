#!/bin/bash

platforms=( darwin linux )
archs=( x64 arm64 )

mkdir -p dist

for platform in "${platforms[@]}"; do
    for arch in "${archs[@]}"; do
        echo "Making $platform-$arch"

        binDir=dist/$platform-$arch/sqlite-merge

        # We have to blow away node_modules as install will not rebuild
        # for different architectures if the module is already present
        # rm -rf node_modules
        # rm -rf package-lock.json

        # yarn does not seem to rebuild for target architectures
        npm install --target_arch=$arch --target_platform=$platform --no-package-lock --production

        npx pkg . -t node16-$platform-$arch -o $binDir --compress Brotli --no-bytecode --public --public-packages="*"
    done
done

rm -rf node_modules
yarn install