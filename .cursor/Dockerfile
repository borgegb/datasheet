FROM node:20-alpine

# Install git
RUN apk add --no-cache git

# The base image node:20-alpine already includes a 'node' user.
# We can switch to it directly.
USER node

# Set the working directory
WORKDIR /home/node/app

# The instructions said not to copy code, and that it will be cloned from GitHub.
# So, we don't need COPY or CMD instructions here for running the app.
# We're just setting up the environment.

# Expose the default Next.js development port (optional, but good practice)
EXPOSE 3000

# You can add more RUN commands here to install any other global tools
# or system dependencies your project might need for development.
# For example:
# RUN npm install -g pnpm # If you use pnpm
# RUN apk add --no-cache postgresql-client # If you need to connect to a Postgres DB
