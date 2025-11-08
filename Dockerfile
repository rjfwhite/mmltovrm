FROM node:20-slim

# Install dependencies for Blender
RUN apt-get update && apt-get install -y \
    wget \
    xz-utils \
    unzip \
    libx11-6 \
    libxi6 \
    libxxf86vm1 \
    libxfixes3 \
    libxrender1 \
    libgl1 \
    libglu1-mesa \
    libsm6 \
    libxkbcommon0 \
    libxkbcommon-x11-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Download and install Blender 4.2 (x86-64 for Cloud Run)
ARG BLENDER_VERSION=4.2.3

WORKDIR /opt
RUN wget -q https://download.blender.org/release/Blender4.2/blender-${BLENDER_VERSION}-linux-x64.tar.xz && \
    tar -xf blender-${BLENDER_VERSION}-linux-x64.tar.xz && \
    rm blender-${BLENDER_VERSION}-linux-x64.tar.xz && \
    ln -s /opt/blender-${BLENDER_VERSION}-linux-x64/blender /usr/local/bin/blender

# Download and install VRM addon from Blender Extensions
RUN mkdir -p /root/.config/blender/${BLENDER_VERSION}/extensions/user_default && \
    cd /tmp && \
    wget -q "https://extensions.blender.org/download/sha256:abffab484ec89f03e5d595fd8f631d952d696523f03848d67fc4829557d17161/add-on-vrm-v3.15.0.zip" -O vrm.zip && \
    unzip -q vrm.zip -d /root/.config/blender/${BLENDER_VERSION}/extensions/user_default/vrm && \
    rm -f /tmp/vrm.zip && \
    echo "VRM addon installed"

# Set up Node.js application
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Build Next.js application
RUN npm run build

# Create directories for file operations
RUN mkdir -p /tmp/uploads /tmp/outputs

# Set environment variables
ENV BLENDER_PATH=/usr/local/bin/blender
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["npm", "start"]
