# Build context = rădăcina repo-ului (vezi docker-compose.yml).

# Etapa 1: build-ul React → fișiere statice în dist/.
FROM node:24-bookworm-slim AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Etapa 2: nginx servește fișierele statice și trimite /api către containerul API.
FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
