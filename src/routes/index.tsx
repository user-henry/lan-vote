import { useLayoutEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Board } from "@/components/board";
import { Composer } from "@/components/composer";
import { usePollStore } from "@/lib/poll-store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const phase = usePollStore((s) => s.phase);
  const booted = usePollStore((s) => s.booted);

  useLayoutEffect(() => {
    const mark = () => usePollStore.setState({ booted: true });
    const unsub = usePollStore.persist.onFinishHydration(mark);
    usePollStore.persist.rehydrate();
    if (usePollStore.persist.hasHydrated()) mark();
    return unsub;
  }, []);

  return (
    <main data-ready={booted ? "true" : "false"} className="mx-auto min-h-dvh w-full max-w-xl px-4 pt-8 pb-16">
      <header className="border-b border-ink pb-4">
        <div className="mb-4 h-1 w-12 bg-primary" />
        <p className="text-sm text-muted">一人一票 · 本机计票</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="font-serif text-5xl text-ink">当场</h1>
          <p className="max-w-44 text-right text-sm text-muted">
            {phase === "live" ? "进行中，票数写在这台设备上。" : "写好问题，发起一场投票。"}
          </p>
        </div>
      </header>
      {phase === "live" ? <Board /> : <Composer />}
    </main>
  );
}
