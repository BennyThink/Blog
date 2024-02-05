const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.REACT_APP_DOMAIN || "http://127.0.0.1:20080/",
      changeOrigin: true,
    }),
  );
};
