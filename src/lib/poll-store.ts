import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type DraftOption = { id: string; label: string };

export type PollOption = { id: string; label: string; votes: number };

export type Poll = {
  question: string;
  options: PollOption[];
  voterChoiceId: string | null;
  demoOn: boolean;
  demoCast: number;
  demoBudget: number;
};

export type Draft = {
  question: string;
  options: DraftOption[];
};

type PollState = {
  booted: boolean;
  phase: "compose" | "live";
  formError: string | null;
  draft: Draft;
  poll: Poll | null;
  setQuestion: (question: string) => void;
  setOption: (id: string, label: string) => void;
  addOption: () => string | null;
  removeOption: (id: string) => void;
  clearDraft: () => void;
  publish: () => void;
  vote: (id: string) => void;
  castDemoVote: () => void;
  toggleDemo: () => void;
  resetVotes: () => void;
  newPoll: () => void;
};

const QUESTION_MAX = 48;
const OPTION_MAX = 28;
const OPTION_MIN = 2;
const OPTION_CAP = 6;
const DEMO_BUDGET = 24;
const DEMO_BATCH = 16;

export const defaultDraft: Draft = {
  question: "",
  options: [
    { id: "draft-1", label: "" },
    { id: "draft-2", label: "" },
  ],
};

const blankDraft: Draft = {
  question: "",
  options: [
    { id: "draft-a", label: "" },
    { id: "draft-b", label: "" },
  ],
};

const memoryStorage: Storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
};

function freshPoll(question: string, labels: string[]): Poll {
  return {
    question,
    voterChoiceId: null,
    demoOn: true,
    demoCast: 0,
    demoBudget: DEMO_BUDGET,
    options: labels.map((label) => ({
      id: crypto.randomUUID(),
      label,
      votes: 0,
    })),
  };
}

export function percentages(votes: number[]): number[] {
  const total = votes.reduce((sum, n) => sum + n, 0);
  if (total <= 0) return votes.map(() => 0);
  const exact = votes.map((n) => (n / total) * 100);
  const floored = exact.map((n) => Math.floor(n));
  let left = 100 - floored.reduce((sum, n) => sum + n, 0);
  const order = exact
    .map((n, index) => ({ index, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const out = [...floored];
  for (let i = 0; i < left; i += 1) {
    const slot = order[i];
    if (!slot) break;
    out[slot.index] += 1;
  }
  return out;
}

export const usePollStore = create<PollState>()(
  persist(
    (set, get) => ({
      booted: false,
      phase: "compose",
      formError: null,
      draft: defaultDraft,
      poll: null,
      setQuestion: (question) =>
        set((s) => ({
          formError: null,
          draft: { ...s.draft, question: question.slice(0, QUESTION_MAX) },
        })),
      setOption: (id, label) =>
        set((s) => ({
          formError: null,
          draft: {
            ...s.draft,
            options: s.draft.options.map((option) =>
              option.id === id ? { ...option, label: label.slice(0, OPTION_MAX) } : option,
            ),
          },
        })),
      addOption: () => {
        if (get().draft.options.length >= OPTION_CAP) return null;
        const id = crypto.randomUUID();
        set((s) => ({
          formError: null,
          draft: {
            ...s.draft,
            options: [...s.draft.options, { id, label: "" }],
          },
        }));
        return id;
      },
      removeOption: (id) =>
        set((s) => {
          if (s.draft.options.length <= OPTION_MIN) return s;
          return {
            formError: null,
            draft: {
              ...s.draft,
              options: s.draft.options.filter((option) => option.id !== id),
            },
          };
        }),
      clearDraft: () => set({ formError: null, draft: blankDraft }),
      publish: () => {
        if (!get().booted) return;
        const question = get().draft.question.trim();
        const labels = get().draft.options.map((option) => option.label.trim());
        if (!question) {
          set({ formError: "先写下一个问题。" });
          return;
        }
        if (labels.length < OPTION_MIN) {
          set({ formError: "至少需要两个选项。" });
          return;
        }
        if (labels.some((label) => label.length === 0)) {
          set({ formError: "每个选项都要有文字。" });
          return;
        }
        if (new Set(labels).size !== labels.length) {
          set({ formError: "选项不能重复。" });
          return;
        }
        set({
          formError: null,
          phase: "live",
          draft: {
            question,
            options: labels.map((label, index) => ({
              id: get().draft.options[index]?.id ?? `draft-${index}`,
              label,
            })),
          },
          poll: freshPoll(question, labels),
        });
      },
      vote: (id) =>
        set((s) => {
          if (!s.poll || s.poll.voterChoiceId) return s;
          if (!s.poll.options.some((option) => option.id === id)) return s;
          return {
            poll: {
              ...s.poll,
              voterChoiceId: id,
              options: s.poll.options.map((option) =>
                option.id === id ? { ...option, votes: option.votes + 1 } : option,
              ),
            },
          };
        }),
      castDemoVote: () =>
        set((s) => {
          if (!s.poll || !s.poll.demoOn) return s;
          if (s.poll.demoCast >= s.poll.demoBudget) return s;
          const index = Math.floor(Math.random() * s.poll.options.length);
          return {
            poll: {
              ...s.poll,
              demoCast: s.poll.demoCast + 1,
              options: s.poll.options.map((option, optionIndex) =>
                optionIndex === index ? { ...option, votes: option.votes + 1 } : option,
              ),
            },
          };
        }),
      toggleDemo: () =>
        set((s) => {
          if (!s.poll) return s;
          const running = s.poll.demoOn && s.poll.demoCast < s.poll.demoBudget;
          if (running) return { poll: { ...s.poll, demoOn: false } };
          const needsMore = s.poll.demoCast >= s.poll.demoBudget;
          return {
            poll: {
              ...s.poll,
              demoOn: false,
              demoBudget: needsMore ? s.poll.demoCast + DEMO_BATCH : s.poll.demoBudget,
            },
          };
        }),
      resetVotes: () =>
        set((s) => {
          if (!s.poll) return s;
          return {
            poll: {
              ...s.poll,
              voterChoiceId: null,
              demoCast: 0,
              demoBudget: DEMO_BUDGET,
              options: s.poll.options.map((option) => ({ ...option, votes: 0 })),
            },
          };
        }),
      newPoll: () =>
        set((s) => ({
          phase: "compose",
          formError: null,
          poll: null,
          draft: s.poll
            ? {
                question: s.poll.question,
                options: s.poll.options.map((option) => ({
                  id: option.id,
                  label: option.label,
                })),
              }
            : s.draft,
        })),
    }),
    {
      name: "dangchang-poll-v2",
      skipHydration: true,
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : localStorage,
      ),
      partialize: (state) => ({
        phase: state.phase,
        draft: state.draft,
        poll: state.poll,
      }),
    },
  ),
);
