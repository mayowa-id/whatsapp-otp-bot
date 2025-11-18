console.log('Starting application...');

// protect early so synchronous errors are caught
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err && err.stack ? err.stack : err);
  process.exit(1);
});

require('dotenv').config();
console.log('Environment loaded');

let Server, redisClient, logger;

try {
  Server = require('./src/api/server');
  console.log('Server module loaded');
} catch (err) {
  console.error('Failed to require server module:', err && err.stack ? err.stack : err);
  process.exit(1);
}

try {
  redisClient = require('./src/database/redis');
  console.log('Redis client module loaded');
} catch (err) {
  console.error('Failed to require redis client module:', err && err.stack ? err.stack : err);
  process.exit(1);
}

try {
  logger = require('./src/utils/logger');
  console.log('Logger module loaded');
} catch (err) {
  console.error('Failed to require logger module:', err && err.stack ? err.stack : err);
  process.exit(1);
}

// attach logger if possible
if (redisClient && typeof redisClient.setLogger === 'function') {
  try {
    redisClient.setLogger(logger);
  } catch (err) {
    console.error('Failed attaching logger to redis client:', err && err.stack ? err.stack : err);
  }
}

// startup watchdog: if nothing logs "App running" within 10s, warn (minimal)
let started = false;
const watchdog = setTimeout(() => {
  if (!started) {
    console.error('Startup appears stalled after 10s; last log was "Environment loaded".');
    // do not exit here — just inform. This helps identify a hang.
  }
}, 10000);

async function startApplication() {
  try {
    console.log('Starting services...'); // single minimal progress log

    await redisClient.connect();
    console.log('Redis connected');

    const server = new Server();
    await server.start();
    const addr = (server.getServer && server.getServer().address && server.getServer().address()) || null;
    const port = (addr && addr.port) || server.port || process.env.PORT || 3000;

    console.log(`App running on port ${port}`);
    started = true;
    clearTimeout(watchdog);

    const gracefulShutdown = async (signal) => {
      console.log(`${signal} received, shutting down`);
      try {
        await server.stop();
      } catch (e) { /* ignore */ }
      try {
        await redisClient.disconnect();
      } catch (e) { /* ignore */ }
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start application:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

startApplication();
