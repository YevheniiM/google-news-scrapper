# Use the official Apify base image with Playwright and Chrome
FROM apify/actor-node-playwright-chrome:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --no-optional

# Copy source code
COPY . ./

# Run the actor
CMD npm start
