/** @type {import('next').NextConfig} */

// Domínio principal: elocriativo.vercel.app, com um caminho por cliente
// (/oleak, /grupo-meddi...). O domínio antigo (dashboard-oleak.vercel.app) e
// os caminhos antigos (/c/<cliente>, /login) redirecionam para o novo, para
// não quebrar links que os clientes já têm.
const MAIN_DOMAIN = "https://elocriativo.vercel.app";
const OLD_HOST = "dashboard-oleak.vercel.app";
const SLUG = ":slug([a-z0-9-]+)";

const nextConfig = {
  reactStrictMode: true,

  async redirects() {
    const oldHost = [{ type: "host", value: OLD_HOST }];
    return [
      // Domínio antigo -> domínio novo (a raiz e /login eram da Oleak).
      { source: "/", has: oldHost, destination: `${MAIN_DOMAIN}/oleak`, permanent: true },
      { source: "/login", has: oldHost, destination: `${MAIN_DOMAIN}/oleak/login`, permanent: true },
      { source: `/c/${SLUG}`, has: oldHost, destination: `${MAIN_DOMAIN}/:slug`, permanent: true },
      { source: `/c/${SLUG}/login`, has: oldHost, destination: `${MAIN_DOMAIN}/:slug/login`, permanent: true },
      // Demais páginas do domínio antigo (a API fica de fora: o cron da Vercel
      // e o próprio dashboard chamam /api/** no domínio em que estiverem).
      { source: "/:path((?!api/|_next/).+)", has: oldHost, destination: `${MAIN_DOMAIN}/:path`, permanent: true },

      // Caminhos antigos em qualquer domínio.
      { source: "/login", destination: "/oleak/login", permanent: true },
      { source: `/c/${SLUG}`, destination: "/:slug", permanent: true },
      { source: `/c/${SLUG}/login`, destination: "/:slug/login", permanent: true },
    ];
  },

  async rewrites() {
    // /<cliente> e /<cliente>/login são servidos pelas páginas em app/c/[slug]
    // (a URL no navegador continua /<cliente>). "afterFiles" = só entra se
    // não existir uma rota de verdade com esse nome (ex: /api).
    return {
      afterFiles: [
        { source: `/${SLUG}`, destination: "/c/:slug" },
        { source: `/${SLUG}/login`, destination: "/c/:slug/login" },
      ],
    };
  },
};

module.exports = nextConfig;
