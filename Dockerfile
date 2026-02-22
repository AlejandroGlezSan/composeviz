# Dockerfile
FROM nginx:alpine

# Copiar archivos estáticos al directorio por defecto de nginx
COPY . /usr/share/nginx/html

# Exponer puerto 80
EXPOSE 80

# Nginx se ejecuta en primer plano por defecto