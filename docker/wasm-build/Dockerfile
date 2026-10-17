# The one toolchain that builds the engine WASM (packages/formspec-engine `build:wasm`).
# Published npm packages (.github/workflows/publish.yml) and formspec-web's vendored copy are
# built here, so their bytes match. Every input is pinned: base images by digest, the Rust
# toolchain by version, wasm-pack and binaryen by release tarball checksum. Sources are
# copied to /src/formspec and /src/fel-core, so cargo sees the same absolute paths everywhere.
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS node

FROM rust:1.94.0-bookworm@sha256:365468470075493dc4583f47387001854321c5a8583ea9604b297e67f01c5a4f
ARG TARGETARCH
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) arch=x86_64;  wasm_pack_sha=c09f971ecaed9a2efc80fdcea7a00ef6b53c7fadc8c57d1f61b53a6aa66b668a; binaryen_sha=0a18362361ad05465118cd8eeb72edaeec89de6894bc283576ef4e07aa3babcc ;; \
      arm64) arch=aarch64; wasm_pack_sha=e17ef0806381c3a0acb9c9ddad643a49facaa5a2ecf657a421d4d8f3357a24b7; binaryen_sha=e6ae6e09ac40f4e14bc5be6f687c58e2995c84170013975fa641809dd3b480a0 ;; \
      *) echo "unsupported architecture $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    wasm_pack="wasm-pack-v0.15.0-${arch}-unknown-linux-musl"; \
    curl -fsSLO "https://github.com/wasm-bindgen/wasm-pack/releases/download/v0.15.0/${wasm_pack}.tar.gz"; \
    echo "${wasm_pack_sha}  ${wasm_pack}.tar.gz" | sha256sum -c -; \
    tar xzf "${wasm_pack}.tar.gz"; install "${wasm_pack}/wasm-pack" /usr/local/bin/wasm-pack; \
    binaryen="binaryen-version_130-${arch}-linux"; \
    curl -fsSLO "https://github.com/WebAssembly/binaryen/releases/download/version_130/${binaryen}.tar.gz"; \
    echo "${binaryen_sha}  ${binaryen}.tar.gz" | sha256sum -c -; \
    tar xzf "${binaryen}.tar.gz"; install binaryen-version_130/bin/wasm-opt /usr/local/bin/wasm-opt; \
    rm -rf wasm-pack-* binaryen-*
RUN rustup target add wasm32-unknown-unknown
# Sources are copied in; cargo's registry, target dir and tool caches live on a named volume.
RUN mkdir -p /src/formspec /src/fel-core /cache
ENV HOME=/cache/home CARGO_HOME=/cache/cargo CARGO_TARGET_DIR=/cache/target
