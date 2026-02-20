FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm config set fetch-retries 5 \
	&& npm config set fetch-retry-maxtimeout 120000 \
	&& npm config set fetch-timeout 120000
RUN npm ci
COPY frontend ./
RUN npm run build

FROM nginx:1.25-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
