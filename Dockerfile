# Multi-stage build for the axum API (workspace).
FROM rust:1.96-slim AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release -p drug-interaction-api

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/target/release/drug-interaction-api /usr/local/bin/
WORKDIR /app
ENV APP_DATASET_PATH=/app/data/ddi_dataset.json
EXPOSE 8001
CMD ["drug-interaction-api"]
