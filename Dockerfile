# Multi-stage build for the axum API (workspace).
# builder and runtime pinned to the SAME Debian release (trixie): a newer
# glibc in the builder than in the runtime makes the binary fail to start
# (rust:1.96-slim moved to trixie; bookworm's glibc 2.36 lacks GLIBC_2.38)
FROM rust:1.96-slim-trixie AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
# sqlx query! macros compile against the committed metadata (no DB at build time)
COPY .sqlx ./.sqlx
ENV SQLX_OFFLINE=true
RUN cargo build --release -p drug-interaction-api

FROM debian:trixie-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app
COPY --from=builder /build/target/release/drug-interaction-api /usr/local/bin/
WORKDIR /app
# never run as root; the dataset is mounted read-only
USER app
ENV APP_DATASET_PATH=/app/data/ddi_dataset.json
EXPOSE 8001
CMD ["drug-interaction-api"]
