import { useEffect, useRef, useState } from "react";
import type { RoomView } from "@/lib/poll-hub";

const emptyView: RoomView = {
  error: null,
  phase: "compose",
  isHost: true,
  mode: "preview",
  links: [],
  question: "",
  options: [],
  total: 0,
  myChoiceId: null,
  version: 0,
};

async function postRoom(body: Record<string, unknown>): Promise<RoomView> {
  const response = await fetch("/api/room", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("计票服务没有响应。");
  return (await response.json()) as RoomView;
}

export function useRoom() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<RoomView>(emptyView);
  const voterId = useRef("");

  useEffect(() => {
    let voter = localStorage.getItem("dangchang-voter-id");
    if (!voter) {
      voter = crypto.randomUUID();
      localStorage.setItem("dangchang-voter-id", voter);
    }
    voterId.current = voter;
    let stop = false;

    const pull = async () => {
      try {
        const response = await fetch(`/api/room?voter=${encodeURIComponent(voter!)}`);
        if (!response.ok) throw new Error("计票服务没有响应。");
        const next = (await response.json()) as RoomView;
        if (!stop) {
          setView(next);
          setReady(true);
        }
      } catch {
        if (!stop) setReady(true);
      }
    };

    void pull();
    const timer = window.setInterval(() => void pull(), 800);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  const publish = async (question: string, options: string[]) => {
    const next = await postRoom({
      action: "create",
      voterId: voterId.current,
      question,
      options,
    });
    setView(next);
    return next.error;
  };

  const vote = async (optionId: string) => {
    const next = await postRoom({ action: "vote", voterId: voterId.current, optionId });
    setView(next);
    return next.error;
  };

  const reset = async () => {
    setView(await postRoom({ action: "reset", voterId: voterId.current }));
  };

  const fresh = async () => {
    setView(await postRoom({ action: "new", voterId: voterId.current }));
  };

  return { ready, view, publish, vote, reset, fresh };
}
