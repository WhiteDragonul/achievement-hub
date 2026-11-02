# Build context = rădăcina repo-ului (vezi docker-compose.yml), ca să putem copia și folderul db/.

# Etapa 1: compilăm TypeScript → JavaScript.
FROM node:24-bookworm-slim AS build
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build

# Etapa 2: imaginea finală are doar dependențele de producție, JS-ul compilat și fișierele SQL.
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/api/dist ./dist
# Migrațiile și fixtures sunt citite din /app/db (cale relativă la dist/db: ../../../db).
COPY db /app/db
EXPOSE 3000
CMD ["node", "dist/main.js"]
