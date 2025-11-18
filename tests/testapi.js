const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testHealthEndpoint() {
  try {
    log('\n Testing Health Endpoint...', 'blue');
    const response = await axios.get(`${BASE_URL}/health`);
    
    if (response.data.success) {
      log('Health check passed', 'green');
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    }
  } catch (error) {
    log(' Health check failed', 'red');
    console.error(error.message);
    return false;
  }
}

async function testDetailedHealth() {
  try {
    log('\nTesting Detailed Health Endpoint...', 'blue');
    const response = await axios.get(`${BASE_URL}/health/detailed`);
    
    if (response.data.success) {
      log(' Detailed health check passed', 'green');
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    }
  } catch (error) {
    log(' Detailed health check failed', 'red');
    console.error(error.message);
    return false;
  }
}

async function testOTPRequest() {
  try {
    log('\n Testing OTP Request...', 'blue');
    const response = await axios.post(`${BASE_URL}/api/v1/otp/request`, {
      phoneNumber: '+1234567890',
      countryCode: 'US',
      priority: 'normal'
    });
    
    if (response.data.success) {
      log(' OTP request successful', 'green');
      console.log(JSON.stringify(response.data, null, 2));
      return response.data.data.requestId;
    }
  } catch (error) {
    log(' OTP request failed', 'red');
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    return null;
  }
}

async function testGetStatus(requestId) {
  try {
    log('\n Testing Get Status...', 'blue');
    const response = await axios.get(`${BASE_URL}/api/v1/otp/status/${requestId}`);
    
    if (response.data.success) {
      log(' Status retrieval successful', 'green');
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    }
  } catch (error) {
    log('Status retrieval failed', 'red');
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    return false;
  }
}

async function testRetrieveOTP(requestId) {
  try {
    log('\n📥 Testing Retrieve OTP...', 'blue');
    const response = await axios.get(`${BASE_URL}/api/v1/otp/retrieve/${requestId}`);
    
    log('✅ Retrieve OTP call successful', 'green');
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    // Expected to fail since OTP processing not yet implemented
    log('⚠️  OTP not ready (expected at this stage)', 'yellow');
    if (error.response && error.response.data) {
      console.log(JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

async function testGetStats() {
  try {
    log('\n📈 Testing Get Stats...', 'blue');
    const response = await axios.get(`${BASE_URL}/api/v1/otp/stats`);
    
    if (response.data.success) {
      log('✅ Stats retrieval successful', 'green');
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    }
  } catch (error) {
    log('❌ Stats retrieval failed', 'red');
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    return false;
  }
}

async function testInvalidRequest() {
  try {
    log('\n🚫 Testing Invalid Request (Validation)...', 'blue');
    await axios.post(`${BASE_URL}/api/v1/otp/request`, {
      phoneNumber: 'invalid-number'
    });
    
    log('❌ Should have failed validation', 'red');
    return false;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      log('✅ Validation working correctly', 'green');
      console.log(JSON.stringify(error.response.data, null, 2));
      return true;
    } else {
      log('❌ Unexpected error', 'red');
      console.error(error.message);
      return false;
    }
  }
}

async function testNotFound() {
  try {
    log('\n🔍 Testing Not Found (404)...', 'blue');
    await axios.get(`${BASE_URL}/api/v1/otp/status/invalid_request_id`);
    
    log('❌ Should have returned 404', 'red');
    return false;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      log('✅ 404 handling working correctly', 'green');
      console.log(JSON.stringify(error.response.data, null, 2));
      return true;
    } else {
      log('❌ Unexpected error', 'red');
      console.error(error.message);
      return false;
    }
  }
}

async function testCancelRequest(requestId) {
  try {
    log('\n❌ Testing Cancel Request...', 'blue');
    const response = await axios.delete(`${BASE_URL}/api/v1/otp/${requestId}`);
    
    if (response.data.success) {
      log('✅ Request cancelled successfully', 'green');
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    }
  } catch (error) {
    log('❌ Cancel request failed', 'red');
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    return false;
  }
}

// Main test runner
async function runAllTests() {
  log('\n' + '='.repeat(60), 'blue');
  log('🚀 WhatsApp OTP Bot - API Testing Suite', 'blue');
  log('='.repeat(60) + '\n', 'blue');

  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  // Test 1: Health Check
  results.total++;
  if (await testHealthEndpoint()) {
    results.passed++;
  } else {
    results.failed++;
    log('\n⚠️  Cannot proceed without healthy server. Exiting...', 'red');
    process.exit(1);
  }

  // Test 2: Detailed Health
  results.total++;
  if (await testDetailedHealth()) {
    results.passed++;
  } else {
    results.failed++;
  }

  // Test 3: OTP Request
  results.total++;
  const requestId = await testOTPRequest();
  if (requestId) {
    results.passed++;
  } else {
    results.failed++;
  }

  // Test 4: Get Status (if we have requestId)
  if (requestId) {
    results.total++;
    if (await testGetStatus(requestId)) {
      results.passed++;
    } else {
      results.failed++;
    }

    // Test 5: Retrieve OTP
    results.total++;
    if (await testRetrieveOTP(requestId)) {
      results.passed++;
    } else {
      results.failed++;
    }

    // Test 6: Cancel Request
    results.total++;
    if (await testCancelRequest(requestId)) {
      results.passed++;
    } else {
      results.failed++;
    }
  }

  // Test 7: Get Stats
  results.total++;
  if (await testGetStats()) {
    results.passed++;
  } else {
    results.failed++;
  }

  // Test 8: Invalid Request
  results.total++;
  if (await testInvalidRequest()) {
    results.passed++;
  } else {
    results.failed++;
  }

  // Test 9: Not Found
  results.total++;
  if (await testNotFound()) {
    results.passed++;
  } else {
    results.failed++;
  }

  // Print summary
  log('\n' + '='.repeat(60), 'blue');
  log('📊 Test Results Summary', 'blue');
  log('='.repeat(60), 'blue');
  log(`Total Tests: ${results.total}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(2)}%`, 
      results.failed === 0 ? 'green' : 'yellow');
  log('='.repeat(60) + '\n', 'blue');

  if (results.failed === 0) {
    log('🎉 All tests passed! Phase 2 is complete.', 'green');
  } else {
    log('⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(error => {
    log('\n💥 Fatal error during testing:', 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  testHealthEndpoint,
  testOTPRequest,
  testGetStatus,
  testRetrieveOTP,
  testGetStats,
  runAllTests
};