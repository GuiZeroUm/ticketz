FROM node:20-alpine as build-deps

WORKDIR /usr/src/app
COPY . .

ENV NODE_OPTIONS --openssl-legacy-provider

RUN npm ci && npm run build

FROM ghcr.io/ticketz-oss/nginx-alpine

WORKDIR /usr/share/nginx/html

COPY --from=build-deps /usr/src/app/build /var/www/public
COPY --from=build-deps /usr/src/app/node_modules/@socket.io/admin-ui/ui/dist /var/www/public/socket-admin
COPY nginx /etc/nginx

CMD (echo "{" && while IFS='=' read -r name value; do \
        printf '\t"%s": "%s"\n' "$name" "$value"; \
    done < <(env) | sed '$!s/$/,/' && echo "}")  > /var/www/public/config.json \
    ; RESOLVERS="$(awk '/^nameserver/{print $2}' /etc/resolv.conf | tr '\n' ' ')" \
    ; [ -n "$RESOLVERS" ] || RESOLVERS="127.0.0.11" \
    ; BACKEND_UPSTREAM="${BACKEND_SERVICE:-backend}:3000" \
    ; printf 'resolver %s valid=10s ipv6=on;\nmap $host $backend_upstream {\n    default "%s";\n}\n' "$RESOLVERS" "$BACKEND_UPSTREAM" > /etc/nginx/conf.d/00-upstream.conf \
    ; nginx -g "daemon off;"
