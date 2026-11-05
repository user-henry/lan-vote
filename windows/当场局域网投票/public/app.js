const params = new URLSearchParams(location.search);
const fromUrl = params.get("host");
if (fromUrl) {
  sessionStorage.setItem("dangchang-host", fromUrl);
  localStorage.setItem("dangchang-host", fromUrl);
  params.delete("host");
  const rest = params.toString();
  history.replaceState(null, "", rest ? `${location.pathname}?${rest}` : location.pathname);
}

const hostKey = sessionStorage.getItem("dangchang-host") || localStorage.getItem("dangchang-host") || "";
let voterId = localStorage.getItem("dangchang-voter-id") || "";
if (!/^[A-Za-z0-9-]{8,80}$/.test(voterId)) {
  voterId = crypto.randomUUID();
  localStorage.setItem("dangchang-voter-id", voterId);
}

const app = document.querySelector("#app");
let view = null;
let error = "";
let confirm = "";
let flashId = "";
let previousVotes = [];
let lastScales = new Map();
let draft = { question: "", options: ["", ""] };

function icon(name) {
  const paths = {
    check: '<path d="M5 12.5 9 16.5 19 7.5"/>',
    lock: '<rect x="6" y="11" width="12" height="9" rx="1.5"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M5 7h14M9 7V5h6v2M8 7l1 13h6l1-13"/>',
    copy: '<rect x="8" y="8" width="11" height="13" rx="1.5"/><path d="M6 16V5.5A1.5 1.5 0 0 1 7.5 4H16"/>',
  };
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
}

function esc(value) {
  return String(value).replace(/[&<>"]/g, (ch) => {
    if (ch === "&") return "\u0026amp;";
    if (ch === "<") return "\u0026lt;";
    if (ch === ">") return "\u0026gt;";
    return "\u0026quot;";
  });
}

async function refresh() {
  const response = await fetch(`/api/state?voter=${encodeURIComponent(voterId)}&host=${encodeURIComponent(hostKey)}`);
  if (!response.ok) throw new Error("计票服务没有响应。");
  const next = await response.json();
  apply(next);
}

async function post(action, extra) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, voterId, hostKey, ...extra }),
  });
  if (!response.ok) throw new Error("计票服务没有响应。");
  const next = await response.json();
  apply(next);
  return next.error || "";
}

function apply(next) {
  const stillEditing = view?.phase === "compose" && next.phase === "compose";
  const stillWaiting = view?.phase === "waiting" && next.phase === "waiting";
  const sameLive =
    view &&
    next.phase === "live" &&
    view.phase === "live" &&
    next.version === view.version &&
    next.myChoiceId === view.myChoiceId;
  if ((stillEditing && !next.error) || stillWaiting || sameLive) {
    view = next;
    const kicker = document.querySelector(".kicker");
    if (kicker) kicker.textContent = `一人一票 · 局域网计票 · 在线 ${next.online}`;
    return;
  }

  const votes = (next.options || []).map((option) => option.votes);
  if (view?.phase === "live" && previousVotes.length === votes.length) {
    const index = votes.findIndex((count, i) => count > previousVotes[i]);
    if (index >= 0) {
      flashId = next.options[index].id;
      window.setTimeout(() => {
        if (flashId !== next.options[index]?.id) return;
        flashId = "";
        const choice = app.querySelector(`[data-vote="${CSS.escape(next.options[index].id)}"]`);
        choice?.classList.remove("flash");
      }, 520);
    }
  } else if (next.phase !== "live") {
    previousVotes = [];
    lastScales = new Map();
  }
  previousVotes = votes;
  if (next.phase !== "live") confirm = "";
  view = next;
  error = next.error || "";
  paint();
  animateBars();
}

function shell(body) {
  const role = !view
    ? "正在连接主持电脑…"
    : view.isHost
      ? "你是主持人"
      : view.phase === "waiting"
        ? "等待主持人发起"
        : "每人只能投一次";
  return `
    <header>
      <div class="rule"></div>
      <p class="kicker">一人一票 · 局域网计票${view ? ` · 在线 ${view.online}` : ""}</p>
      <div class="mast">
        <h1>当场</h1>
        <p>${esc(role)}</p>
      </div>
    </header>
    ${shareBlock()}
    ${body}
  `;
}

function shareBlock() {
  if (!view?.isHost) return "";
  const links = view.links?.length ? view.links : [];
  const rows = links.length
    ? links
        .map(
          (link, index) => `
        <div class="link-row">
          <code>${esc(link)}</code>
          <button class="btn line" type="button" data-copy="${index}">${icon("copy")}<span>复制</span></button>
        </div>`,
        )
        .join("")
    : `<p class="hint">还没发现局域网地址。请确认这台电脑已经连上 Wi-Fi。</p>`;
  return `
    <section class="share">
      <h2>把地址发给同一 Wi-Fi 里的人</h2>
      <div class="links">${rows}</div>
      <p class="hint">他们用浏览器打开即可投票。如果手机打不开，请允许 Windows 防火墙里的 Node.js。</p>
    </section>`;
}

function composer() {
  const options = draft.options
    .map(
      (label, index) => `
      <div class="row">
        <span class="index">${String(index + 1).padStart(2, "0")}</span>
        <input data-option="${index}" maxlength="28" placeholder="选项" value="${esc(label)}" aria-label="选项 ${index + 1}" />
        ${
          draft.options.length > 2
            ? `<button class="icon-btn" type="button" data-remove="${index}" aria-label="移除选项 ${index + 1}">${icon("trash")}</button>`
            : `<span class="icon-btn"></span>`
        }
      </div>`,
    )
    .join("");
  return `
    <section class="panel" style="margin-top:1.5rem">
      <label class="pad question-label">问题
        <input id="question" class="question" maxlength="48" placeholder="写下要决定的事" value="${esc(draft.question)}" />
      </label>
      ${options}
      <div class="toolbar">
        <button class="text-btn" type="button" data-add ${draft.options.length >= 6 ? "disabled" : ""}>
          ${icon("plus")}${draft.options.length >= 6 ? "最多 6 个选项" : "添加选项"}
        </button>
        <button class="text-btn" type="button" data-clear>清空重写</button>
      </div>
    </section>
    <p class="hint">2 到 6 个选项。发起后题目锁定，只有主持人能重置。</p>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
    <button class="btn block" type="button" data-publish>发起投票</button>`;
}

function waiting() {
  return `
    <section class="panel wait">
      <p class="field-label">投票还没开始</p>
      <h2>等主持人写好问题</h2>
      <p class="hint">页面会自动接上，不用刷新。</p>
    </section>`;
}

function board() {
  const max = Math.max(0, ...view.options.map((option) => option.votes));
  const leaders = view.options.filter((option) => option.votes === max && max > 0).length;
  const mine = view.options.find((option) => option.id === view.myChoiceId);
  const rows = view.options
    .map((option) => {
      const selected = option.id === view.myChoiceId;
      const locked = Boolean(view.myChoiceId) && !selected;
      const top = option.votes === max && max > 0;
      const status = selected ? "已选择" : locked ? "不可再投" : "点此投票";
      return `
        <button class="choice${selected ? " mine" : ""}${flashId === option.id ? " flash" : ""}" type="button" data-vote="${esc(option.id)}" ${locked ? "disabled" : ""} aria-pressed="${selected}">
          <span class="choice-top">
            <span class="mark${selected ? " mine" : locked ? " locked" : ""}">${selected ? icon("check") : locked ? icon("lock") : ""}</span>
            <span class="choice-copy">
              <strong>${esc(option.label)}</strong>
              <span class="meta">
                <span>${status}</span>
                ${top && leaders === 1 ? '<span class="chip">领先</span>' : ""}
                ${top && leaders > 1 ? '<span class="chip-line">并列</span>' : ""}
              </span>
            </span>
            <span class="pct">${option.percent}<small>%</small></span>
          </span>
          <span class="bar" aria-hidden="true"><i class="${selected || top ? "hot" : ""}" style="transform:scaleX(${option.percent / 100})"></i></span>
          <span class="count">${option.votes} 票${selected ? " · 含你的一票" : ""}</span>
        </button>`;
    })
    .join("");

  const actions = !view.isHost
    ? ""
    : confirm === "reset"
      ? `<div class="panel pad confirm"><p>清空这场的全部票数？题目会留下，大家可以重新投一次。</p><div class="actions"><button class="btn line" type="button" data-cancel>取消</button><button class="btn" type="button" data-reset>清空票数</button></div></div>`
      : confirm === "fresh"
        ? `<div class="panel pad confirm"><p>离开这场，回到编辑？当前票数不会保留。</p><div class="actions"><button class="btn line" type="button" data-cancel>取消</button><button class="btn" type="button" data-fresh>回到编辑</button></div></div>`
        : `<div class="actions"><button class="btn line" type="button" data-ask="reset">重置票数</button><button class="btn quiet" type="button" data-ask="fresh">发起新投票</button></div>`;

  return `
    <div class="stats">
      <div>
        <span>总票数</span>
        <p class="total">${view.total}</p>
      </div>
      <div class="right">
        <span>你的投票</span>
        <strong>${mine ? esc(mine.label) : "尚未投票"}</strong>
        <span>${mine ? "已锁定，不能改票" : "只能投一次"}</span>
      </div>
    </div>
    <section class="panel">
      <div class="pad">
        <h2>${esc(view.question)}</h2>
        <p class="hint">${mine ? `你选了「${esc(mine.label)}」。其余选项已锁定。` : "点一行投出你的一票。结果条会马上跟上。"}</p>
      </div>
      <div role="group" aria-label="${esc(view.question)}">${rows}</div>
    </section>
    ${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
    ${actions}
    <p class="status-line">${view.isHost ? "重置和换题只有这台主持电脑能操作。" : "票数由主持电脑统一计算。"}</p>`;
}

function paint() {
  const body = !view ? `<p class="hint">正在连接…</p>` : view.phase === "compose" ? composer() : view.phase === "waiting" ? waiting() : board();
  app.innerHTML = shell(body);
}

function animateBars() {
  if (view?.phase !== "live") return;
  for (const option of view.options) {
    const bar = app.querySelector(`[data-vote="${CSS.escape(option.id)}"] .bar i`);
    if (!bar) continue;
    const nextScale = option.percent / 100;
    const prevScale = lastScales.get(option.id);
    if (prevScale != null && prevScale !== nextScale) {
      bar.style.transform = `scaleX(${prevScale})`;
      requestAnimationFrame(() => {
        bar.style.transform = `scaleX(${nextScale})`;
      });
    }
    lastScales.set(option.id, nextScale);
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* use the fallback below */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}
app.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target || !view) return;
  try {
    if (target.dataset.copy != null) {
      const link = view.links[Number(target.dataset.copy)];
      await copyText(link);
      const label = target.querySelector("span");
      if (label) label.textContent = "已复制";
      return;
    }
    if (target.dataset.add != null && draft.options.length < 6) {
      keepDraft();
      draft.options.push("");
      paint();
      return;
    }
    if (target.dataset.remove != null) {
      keepDraft();
      draft.options.splice(Number(target.dataset.remove), 1);
      paint();
      return;
    }
    if (target.dataset.clear != null) {
      draft = { question: "", options: ["", ""] };
      error = "";
      paint();
      return;
    }
    if (target.dataset.publish != null) {
      keepDraft();
      await post("create", draft);
      return;
    }
    if (target.dataset.vote) {
      await post("vote", { optionId: target.dataset.vote });
      return;
    }
    if (target.dataset.ask) {
      confirm = target.dataset.ask;
      paint();
      return;
    }
    if (target.dataset.cancel != null) {
      confirm = "";
      paint();
      return;
    }
    if (target.dataset.reset != null) {
      previousVotes = [];
      lastScales = new Map();
      confirm = "";
      await post("reset");
      return;
    }
    if (target.dataset.fresh != null) {
      previousVotes = [];
      lastScales = new Map();
      draft = {
        question: view.question || "",
        options: view.options.length ? view.options.map((option) => option.label) : ["", ""],
      };
      confirm = "";
      await post("new");
    }
  } catch {
    error = "和主持电脑断开了，正在重连。";
    paint();
  }
});

app.addEventListener("input", (event) => {
  const input = event.target;
  if (input.id === "question") draft.question = input.value;
  if (input.dataset.option != null) draft.options[Number(input.dataset.option)] = input.value;
});

function keepDraft() {
  const question = app.querySelector("#question");
  if (question) draft.question = question.value;
  for (const input of app.querySelectorAll("[data-option]")) {
    draft.options[Number(input.dataset.option)] = input.value;
  }
}

paint();
refresh().catch(() => {
  error = "连不上主持程序。请确认黑色窗口还开着。";
  paint();
});
setInterval(() => {
  refresh().catch(() => {});
}, 2000);

const events = new EventSource("/api/events");
events.onmessage = () => {
  refresh().catch(() => {});
};
