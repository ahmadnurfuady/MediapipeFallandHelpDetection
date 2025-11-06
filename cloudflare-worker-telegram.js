// Cloudflare Worker: Telegram proxy (recommended).
// - Store your bot token as secret: TELEGRAM_BOT_TOKEN
// - Deploy and use the Worker URL in app.js TELEGRAM.proxyUrl
// - Accepts POST { chat_id: string, text: string }
// - Adds CORS headers for browser access.

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors, status: 204 });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ ok: false, error: "Method Not Allowed" }),
        {
          headers: { "Content-Type": "application/json", ...cors },
          status: 405,
        }
      );
    }

    try {
      const body = await request.json();
      const chat_id = body.chat_id;
      const text = body.text;
      if (!chat_id || !text) {
        return new Response(
          JSON.stringify({ ok: false, error: "chat_id and text required" }),
          {
            headers: { "Content-Type": "application/json", ...cors },
            status: 400,
          }
        );
      }

      const token = env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        return new Response(
          JSON.stringify({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN" }),
          {
            headers: { "Content-Type": "application/json", ...cors },
            status: 500,
          }
        );
      }

      const url = `https://api.telegram.org/bot${encodeURIComponent(
        token
      )}/sendMessage`;
      const tgResp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });

      const data = await tgResp.text(); // forward raw response
      const ok = tgResp.ok;
      return new Response(data, {
        headers: { "Content-Type": "application/json", ...cors },
        status: ok ? 200 : tgResp.status,
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: e?.message || "Internal Error" }),
        {
          headers: { "Content-Type": "application/json", ...cors },
          status: 500,
        }
      );
    }
  },
};
