export type RoomOption = {
  id: string;
  label: string;
  votes: number;
  percent: number;
};

export type RoomView = {
  error: string | null;
  phase: "compose" | "waiting" | "live";
  isHost: boolean;
  mode: "preview" | "lan";
  links: string[];
  question: string;
  options: RoomOption[];
  total: number;
  myChoiceId: string | null;
  version: number;
};

type Option = { id: string; label: string; votes: number };
type Poll = { question: string; options: Option[]; voters: Record<string, string> };

const QUESTION_MAX = 48;
const OPTION_MAX = 28;

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

function cleanLabels(options: unknown): string[] | null {
  if (!Array.isArray(options)) return null;
  return options.map((item) => String(item ?? "").trim().slice(0, OPTION_MAX));
}

class PollHub {
  private poll: Poll | null = null;
  private version = 0;

  view(voterId: string): RoomView {
    if (!this.poll) {
      return {
        error: null,
        phase: "compose",
        isHost: true,
        mode: "preview",
        links: [],
        question: "",
        options: [],
        total: 0,
        myChoiceId: null,
        version: this.version,
      };
    }
    const counts = this.poll.options.map((option) => option.votes);
    const shares = percentages(counts);
    const total = counts.reduce((sum, n) => sum + n, 0);
    return {
      error: null,
      phase: "live",
      isHost: true,
      mode: "preview",
      links: [],
      question: this.poll.question,
      options: this.poll.options.map((option, index) => ({
        id: option.id,
        label: option.label,
        votes: option.votes,
        percent: shares[index] ?? 0,
      })),
      total,
      myChoiceId: this.poll.voters[voterId] ?? null,
      version: this.version,
    };
  }

  create(voterId: string, question: string, rawOptions: unknown): RoomView {
    const title = question.trim().slice(0, QUESTION_MAX);
    const labels = cleanLabels(rawOptions);
    if (!title) return { ...this.view(voterId), error: "先写下一个问题。" };
    if (!labels || labels.length < 2) return { ...this.view(voterId), error: "至少需要两个选项。" };
    if (labels.length > 6) return { ...this.view(voterId), error: "最多 6 个选项。" };
    if (labels.some((label) => label.length === 0)) {
      return { ...this.view(voterId), error: "每个选项都要有文字。" };
    }
    if (new Set(labels).size !== labels.length) {
      return { ...this.view(voterId), error: "选项不能重复。" };
    }
    this.poll = {
      question: title,
      voters: {},
      options: labels.map((label) => ({ id: crypto.randomUUID(), label, votes: 0 })),
    };
    this.version += 1;
    return this.view(voterId);
  }

  vote(voterId: string, optionId: string): RoomView {
    if (!voterId) return { ...this.view(voterId), error: "缺少投票身份。" };
    if (!this.poll) return { ...this.view(voterId), error: "还没有进行中的投票。" };
    if (this.poll.voters[voterId]) return { ...this.view(voterId), error: "你已经投过了。" };
    const option = this.poll.options.find((item) => item.id === optionId);
    if (!option) return { ...this.view(voterId), error: "这个选项不存在。" };
    option.votes += 1;
    this.poll.voters[voterId] = optionId;
    this.version += 1;
    return this.view(voterId);
  }

  reset(voterId: string): RoomView {
    if (!this.poll) return this.view(voterId);
    for (const option of this.poll.options) option.votes = 0;
    this.poll.voters = {};
    this.version += 1;
    return this.view(voterId);
  }

  fresh(voterId: string): RoomView {
    this.poll = null;
    this.version += 1;
    return this.view(voterId);
  }
}

const globalHub = globalThis as typeof globalThis & { __dangchangHub?: PollHub };

export function getHub(): PollHub {
  if (!globalHub.__dangchangHub) globalHub.__dangchangHub = new PollHub();
  return globalHub.__dangchangHub;
}
