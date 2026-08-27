const serverless = require('serverless-http');
const { createApp } = require('./api-app');

const app = createApp();

// Netlify invokes as /.netlify/functions/api/... — strip that prefix for Express routes
const handler = serverless(app, {
  binary: false,
  basePath: '/.netlify/functions/api'
});

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  // Normalize path variants Netlify may send
  if (event && typeof event.path === 'string') {
    event.path = event.path
      .replace(/^\/\.netlify\/functions\/api/, '')
      .replace(/^\/api/, '') || '/';
  }
  if (event && typeof event.rawPath === 'string') {
    event.rawPath = event.rawPath
      .replace(/^\/\.netlify\/functions\/api/, '')
      .replace(/^\/api/, '') || '/';
  }

  return handler(event, context);
};
