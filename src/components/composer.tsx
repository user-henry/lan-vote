import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { usePollStore } from "@/lib/poll-store";

export function Composer() {
  const draft = usePollStore((s) => s.draft);
  const formError = usePollStore((s) => s.formError);
  const setQuestion = usePollStore((s) => s.setQuestion);
  const setOption = usePollStore((s) => s.setOption);
  const addOption = usePollStore((s) => s.addOption);
  const removeOption = usePollStore((s) => s.removeOption);
  const clearDraft = usePollStore((s) => s.clearDraft);
  const publish = usePollStore((s) => s.publish);
  const booted = usePollStore((s) => s.booted);
  const atCap = draft.options.length >= 6;
  const canRemove = draft.options.length > 2;

  return (
    <div className="mt-8">
      <section className="overflow-hidden rounded-xl border border-ink bg-surface">
        <label className="block border-b border-line px-4 py-4" htmlFor="poll-question">
          <span className="text-sm text-muted">问题</span>
          <input
            id="poll-question"
            value={draft.question}
            maxLength={48}
            placeholder="写下要决定的事"
            autoComplete="off"
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                publish();
              }
            }}
            className="mt-2 w-full bg-transparent font-serif text-3xl text-ink outline-none placeholder:text-muted"
          />
        </label>

        <ul>
          {draft.options.map((option, index) => (
            <li key={option.id} className="flex items-center gap-2 border-b border-line px-4">
              <span className="w-6 shrink-0 text-sm tabular-nums text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <input
                id={`opt-${option.id}`}
                value={option.label}
                maxLength={28}
                placeholder="选项"
                autoComplete="off"
                aria-label={`选项 ${index + 1}`}
                onChange={(event) => setOption(option.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    publish();
                  }
                }}
                className="min-h-12 w-full bg-transparent text-base text-ink outline-none placeholder:text-muted"
              />
              <button
                type="button"
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:text-ink",
                  !canRemove && "invisible",
                )}
                aria-label={`移除选项 ${index + 1}`}
                disabled={!canRemove}
                onClick={() => removeOption(option.id)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:text-muted"
            disabled={atCap}
            onClick={() => {
              const id = addOption();
              if (!id) return;
              requestAnimationFrame(() => {
                document.getElementById(`opt-${id}`)?.focus();
              });
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            {atCap ? "最多 6 个选项" : "添加选项"}
          </button>
          <button
            type="button"
            className="min-h-11 text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
            onClick={clearDraft}
          >
            清空重写
          </button>
        </div>
      </section>

      <p className="mt-3 text-sm text-muted">自己写问题和选项，2 到 6 个。发起后题目锁定，票数可以重置。</p>

      {formError ? (
        <p role="alert" className="mt-3 text-sm font-medium text-primary">
          {formError}
        </p>
      ) : null}

      <Button type="button" size="block" className="mt-5" disabled={!booted} onClick={publish}>
        发起投票
      </Button>
    </div>
  );
}
