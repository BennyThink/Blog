// Tell the in-process warmer which socket belongs to this server.
export function activatePrewarmListener(server, protocol = "http") {
  const activate = () => {
    const address = server.address();
    if (!address || typeof address === "string") return;
    const host = address.address === "0.0.0.0" ? "127.0.0.1"
      : address.address === "::" ? "::1" : address.address;
    const authority = host.includes(":") ? `[${host}]` : host;
    const origin = `${protocol}://${authority}:${address.port}`;
    process.env.DMESG_PREWARM_ORIGIN = origin;
    process.env.DMESG_PREWARM_HOST = `localhost:${address.port}`;

    // Astro loads the request middleware lazily.
    void fetch(new URL("/_emdash/api/health", origin), {
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    }).then(response => response.body?.cancel()).catch(error => {
      console.warn("Could not initialize page prewarm", error.message);
    });
  };
  if (server.listening) activate();
  else server.once("listening", activate);
}
