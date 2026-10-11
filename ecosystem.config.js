// PM2 process file for the production server.
// Next reads PORT. SSH forwarding must target this same port on the server.
// Example: ssh -L 3000:127.0.0.1:3000 user@server
//
// From E:\internal-tool\read-out, after npm run build:
//   pm2 startOrReload ecosystem.config.js --update-env

module.exports = {
  apps: [
    {
      name: "read-out",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
