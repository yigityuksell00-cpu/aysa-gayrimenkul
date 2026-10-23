# Node.js Resmi İmajı
FROM node:20-alpine

# Çalışma dizini
WORKDIR /app

# Paket tanımları
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install --production

# Proje dosyalarını kopyala
COPY . .

# Port
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

# Başlat
CMD ["node", "server.js"]
