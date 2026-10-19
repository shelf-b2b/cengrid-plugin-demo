#!/bin/sh
set -eu
if ! command -v ssh >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends openssh-client
fi
kernel_setup_dir=$(mktemp -d)
trap 'rm -rf "$kernel_setup_dir"' EXIT
cd "$kernel_setup_dir"
kernel --version >/dev/null
