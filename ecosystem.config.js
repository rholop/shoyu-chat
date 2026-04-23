module.exports = {
  apps: [
    {
      name: 'shoyu-chat',
      script: 'server/dist/index.js',
      cwd: __dirname,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '500M',
      kill_timeout: 5000,
      wait_ready: false,
      autorestart: true,
      watch: false,
    },
  ],
};
