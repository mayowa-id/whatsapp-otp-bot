require('dotenv').config();
const Redis = require('ioredis');

console.log('=== Testing Configuration ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('REDIS_HOST:', process.env.REDIS_HOST || 'localhost');
console.log('REDIS_PORT:', process.env.REDIS_PORT || 6379);
console.log('\n=== Testing Redis Connection ===');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  lazyConnect: true,
  retryStrategy: () => null
});

redis.connect()
  .then(() => {
    console.log(' Redis connected successfully!');
    return redis.ping();
  })
  .then((result) => {
    console.log(' Redis PING:', result);
    redis.quit();
    console.log('\n✅ All tests passed! Ready to start server.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Redis connection failed:', err.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure Redis is running in WSL: wsl -d Ubuntu-22.04 -- sudo service redis-server status');
    console.error('2. Check if Redis config allows external connections');
    console.error('3. Try connecting from WSL: redis-cli ping');
    process.exit(1);
  });