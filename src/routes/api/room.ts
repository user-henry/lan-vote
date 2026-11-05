import { createFileRoute } from "@tanstack/react-router";

type Body = {
  action?: string;
  voterId?: string;
  question?: string;
  options?: unknown;
  optionId?: string;
};

async function hub() {
  const { getHub } = await import("@/lib/poll-hub");
  return getHub();
}

function json(data: unknown) {
  return Response.json(data, {
    headers: { "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/room")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const voterId = new URL(request.url).searchParams.get("voter") ?? "";
        return json((await hub()).view(voterId.slice(0, 80)));
      },
      POST: async ({ request }) => {
        let body: Body = {};
        try {
          body = (await request.json()) as Body;
        } catch {
          body = {};
        }
        const voterId = String(body.voterId ?? "").slice(0, 80);
        const room = await hub();
        if (body.action === "create") {
          return json(room.create(voterId, String(body.question ?? ""), body.options));
        }
        if (body.action === "vote") {
          return json(room.vote(voterId, String(body.optionId ?? "")));
        }
        if (body.action === "reset") return json(room.reset(voterId));
        if (body.action === "new") return json(room.fresh(voterId));
        return json({ ...(room.view(voterId)), error: "无法识别的操作。" });
      },
    },
  },
});
