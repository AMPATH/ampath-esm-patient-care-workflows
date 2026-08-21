const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    app.use(
        '/etl',
        createProxyMiddleware({
            target: 'https://ngx.ampath.or.ke/etl-latest/etl/',
            changeOrigin: true,
            pathRewrite: { '^/etl': '' },
            secure: false
        })
    );
};
