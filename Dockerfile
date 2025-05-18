# Gunakan base image Node.js
FROM node:18

# Buat direktori kerja di dalam container
WORKDIR /app

# Copy file konfigurasi dan dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy seluruh project ke container
COPY . .

# Jalankan aplikasi
CMD ["node", "index.js"]

# Expose port (ubah jika app kamu pakai port lain)
EXPOSE 3000
