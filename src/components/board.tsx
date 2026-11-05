import { useEffect, useRef, useState } from "react";
import { Check, Lock, Pause, Play, RotateCcw, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { percentages, usePollStore, type Poll } from "@/lib/poll-store";

function demoCopy(poll: Poll): string {
  if (!poll.demoOn) return "演示已暂停";
  if (poll.demoCast >= poll.demoBudget) return "这一轮演示结束";
  return "演示现场进行中";
}

export function Board() {
  const poll = usePollStore((s) => s.poll);
  const vote = usePollStore((s) => s.vote);
  const toggleDemo = usePollStore((s) => s.toggleDemo);
  const resetVotes = usePollStore((s) => s.resetVotes);
  const newPoll = usePollStore((s) => s.newPoll);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"reset" | "fresh" | null>(null);
  const prevVotes = useRef<number[]>([]);

  const demoOn = poll?.demoOn ?? false;
  const demoCast = poll?.demoCast ?? 0;
  const demoBudget = poll?.demoBudget ?? 0;
  const optionCount = poll?.options.length ?? 0;

  useEffect(() => {
    if (!demoOn || demoCast >= demoBudget || optionCount === 0) return;
    const delay = 720 + Math.round(Math.random() * 480);
    const timer = window.setTimeout(() => {
      usePollStore.getState().castDemoVote();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [demoOn, demoCast, demoBudget, optionCount]);

  useEffect(() => {
    if (!poll) return;
    const current = poll.options.map((option) => option.votes);
    const previous = prevVotes.current;
    if (previous.length === current.length) {
      const index = current.findIndex((count, i) => count > (previous[i] ?? 0));
      if (index >= 0) setFlashId(poll.options[index]?.id ?? null);
    }
    prevVotes.current = current;
  }, [poll]);

  useEffect(() => {
    if (!flashId) return;
    const timer = window.setTimeout(() => setFlashId(null), 520);
    return () => window.clearTimeout(timer);
  }, [flashId]);

  if (!poll) return null;

  const counts = poll.options.map((option) => option.votes);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const shares = percentages(counts);
  const max = counts.reduce((best, count) => Math.max(best, count), 0);
  const leaderCount = counts.filter((count) => count === max && max > 0).length;
  const choice = poll.options.find((option) => option.id === poll.voterChoiceId) ?? null;
  const hasVoted = choice !== null;
  const running = poll.demoOn && poll.demoCast < poll.demoBudget;

  return (
    <div className="mt-8">
      <div className="grid grid-cols-2 gap-4 border-y border-ink py-4">
        <div>
          <p className="text-sm text-muted">总票数</p>
          <p className="mt-2 font-serif text-5xl tabular-nums leading-none">{total}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted">你的投票</p>
          <p className="mt-2 font-medium break-words">{choice ? choice.label : "尚未投票"}</p>
          <p className="text-sm text-muted">{choice ? "已锁定，不能改票" : "只能投一次"}</p>
        </div>
      </div>

      <section className="mt-5 overflow-hidden rounded-xl border border-ink bg-surface">
        <div className="border-b border-line px-4 py-4">
          <h2 id="poll-question" className="font-serif text-3xl break-words">
            {poll.question}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {hasVoted
              ? `你选了「${choice.label}」。其余选项已锁定。`
              : "点一行投出你的一票。结果条会马上跟上。"}
          </p>
        </div>

        <div role="group" aria-labelledby="poll-question">
          {poll.options.map((option, index) => {
            const selected = option.id === poll.voterChoiceId;
            const unavailable = hasVoted && !selected;
            const isTop = option.votes === max && max > 0;
            const share = shares[index] ?? 0;
            const flashing = flashId === option.id;
            const status = selected ? "已选择" : unavailable ? "不可再投" : "点此投票";

            return (
              <button
                key={option.id}
                type="button"
                disabled={unavailable}
                aria-pressed={selected}
                onClick={() => vote(option.id)}
                className={cn(
                  "block w-full border-b border-line px-4 py-4 text-left transition-colors duration-150 last:border-b-0",
                  "focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                  (selected || flashing) && "bg-wash",
                  !hasVoted && "hover:bg-paper",
                  unavailable && "cursor-not-allowed bg-paper",
                )}
              >
                <span className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
                      selected && "border-primary bg-primary text-on-primary",
                      unavailable && "border-line bg-paper text-muted",
                      !selected && !unavailable && "border-line bg-surface text-transparent",
                    )}
                    aria-hidden="true"
                  >
                    {selected ? (
                      <Check className="size-3.5" strokeWidth={2.5} />
                    ) : unavailable ? (
                      <Lock className="size-3.5" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium break-words">{option.label}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                      <span>{status}</span>
                      {isTop && leaderCount === 1 ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-on-primary">
                          领先
                        </span>
                      ) : null}
                      {isTop && leaderCount > 1 ? (
                        <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink">
                          并列
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="shrink-0 font-serif text-3xl tabular-nums leading-none">
                    {share}
                    <span className="text-base">%</span>
                  </span>
                </span>
                <span className="mt-3 block h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <span
                    className={cn(
                      "block h-full w-full origin-left transition-transform duration-500 ease-out motion-reduce:transition-none",
                      selected || isTop ? "bg-primary" : "bg-ink/35",
                    )}
                    style={{ transform: `scaleX(${share / 100})` }}
                  />
                </span>
                <span className="mt-2 block text-sm tabular-nums text-muted">
                  {option.votes} 票{selected ? " · 含你的一票" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{demoCopy(poll)}</span>
          <span className="mt-1 block">
            演示票只在这台设备上跳动，方便看结果条。你本人仍然只能投一次。
          </span>
        </p>
        <Button variant="line" className="shrink-0" onClick={toggleDemo}>
          {running ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
          {running ? "暂停" : "继续"}
        </Button>
      </div>

      <div className="mt-6">
        {confirm === "reset" ? (
          <ConfirmBar
            prompt="清空这场的全部票数？题目会留下，你可以重新投一次。"
            confirmLabel="清空票数"
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              resetVotes();
              setConfirm(null);
              prevVotes.current = [];
            }}
          />
        ) : confirm === "fresh" ? (
          <ConfirmBar
            prompt="离开这场，回到编辑？当前票数不会保留。"
            confirmLabel="回到编辑"
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              newPoll();
              setConfirm(null);
            }}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="line" size="block" onClick={() => setConfirm("reset")}>
              <RotateCcw className="size-4" aria-hidden="true" />
              重置票数
            </Button>
            <Button variant="quiet" size="block" className="border border-line" onClick={() => setConfirm("fresh")}>
              <SquarePen className="size-4" aria-hidden="true" />
              发起新投票
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmBar({
  prompt,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  prompt: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-ink bg-surface p-4">
      <p className="text-sm">{prompt}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="line" size="block" onClick={onCancel}>
          取消
        </Button>
        <Button size="block" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
