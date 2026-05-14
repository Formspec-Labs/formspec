#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <source-dir> <target-dir>" >&2
  exit 1
fi

src_dir=$1
target_dir=$2

mkdir -p "$target_dir/styles"
cp "$src_dir/formspec-layout.css" "$src_dir/formspec-default.css" "$src_dir/default-theme.json" "$src_dir/token-registry.json" "$target_dir/"
cp -R "$src_dir/styles/." "$target_dir/styles/"
