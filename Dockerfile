# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY frontend ./frontend
RUN npm --prefix frontend install && npm --prefix frontend run build

FROM node:20-alpine
RUN apk add --no-cache nginx
WORKDIR /app
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY backend ./backend
COPY package*.json ./
RUN npm --prefix backend install --omit=dev
COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 8080
CMD ["/app/entrypoint.sh"]
