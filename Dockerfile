# Un'immagine sola per server, worker, web e migration: cambia solo il comando,
# che lo decide il compose di chi la usa. La costruisce la CI e la pubblica su
# ghcr.io/sanvisimo/ludex; il mini PC la scarica e non compila niente.
#
# Nessun segreto qui dentro: le variabili stanno in un env_file fuori
# dall'immagine, e il .dockerignore tiene fuori il .env.
FROM node:24.21-bookworm-slim
RUN npm install -g pnpm@12.7.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# PUBLIC_API_URL entra nel bundle del web a build time (define di Vite):
# cambiarla vuol dire ricostruire l'immagine, non riavviare.
ARG PUBLIC_API_URL
RUN pnpm --filter web build
