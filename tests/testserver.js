const Server = require('./src/api/server');

// minimal runner: starts the server, logs only on success or fatal error
(async () => {
  try {
    const server = new Server();
    await server.start();

    const httpServer = server.getServer();
    const addr = httpServer && typeof httpServer.address === 'function' ? httpServer.address() : null;
    const port = (addr && addr.port) || server.port || process.env.PORT || 3000;

    console.log(`Server started on port ${port}`);

    // graceful shutdown on Ctrl+C
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await server.stop();
      process.exit(0);
    });

    // surface unhandled errors (minimal output)
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Rejection:', reason);
    });
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      process.exit(1);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
