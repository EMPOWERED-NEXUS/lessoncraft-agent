const $ = (id) => document.getElementById(id);

let sessionId = null;
let packs = [];

function chipsFor(pack) {
  if (!pack) return;
  $("chips").innerHTML = [
    pack.education_subsystem,
    pack.grade_or_level,
    pack.subject,
    pack.language_code,
    pack.assessment_style,
  ]
    .map((t) => `<span class="chip">${t}</span>`)
    .join("");
  const note = $("disclaimer");
  if (note) note.textContent = "Original LessonCraft synthetic content in this earlier lesson. Not an official curriculum.";
}

function renderTrace(events) {
  const list = $("trace");
  for (const ev of events ?? []) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${ev.role}</strong> · ${ev.step}<br/>${ev.summary}`;
    list.appendChild(li);
  }
}

async function drawMermaid(text) {
  const el = $("visual");
  el.innerHTML = "";
  if (!text || !window.mermaid) {
    el.textContent = "No visual.";
    return;
  }
  const id = `mmd-${Date.now()}`;
  const { svg } = await window.mermaid.render(id, text);
  el.innerHTML = svg;
}

async function bootstrap() {
  const [packRes, zRes, health] = await Promise.all([
    fetch("/api/packs").then((r) => r.json()),
    fetch("/api/zetaris/diagnostic").then((r) => r.json()),
    fetch("/api/health").then((r) => r.json()),
  ]);
  packs = packRes.packs ?? [];
  const select = $("pack");
  select.innerHTML = packs
    .map((p) => `<option value="${p.pack_id}">${p.subject} · ${p.grade_or_level}</option>`)
    .join("");
  chipsFor(packs[0]);
  select.addEventListener("change", () => {
    chipsFor(packs.find((p) => p.pack_id === select.value));
  });
  $("zetaris").textContent = `${zRes.status}: ${zRes.message}`;
  $("hmemMeta").textContent = health.hmem?.error
    ? health.hmem.error
    : `H-MEM ${health.hmem?.source ?? "?"} pin ${health.hmem?.pin ?? "?"}`;
  if (packs[0]?.artefacts === undefined) {
    $("diagnostic").value =
      "Multiplying makes numbers bigger, so 1/2 × 1/2 is 1.";
  }
}

$("go").addEventListener("click", async () => {
  $("status").textContent = "Working…";
  $("trace").innerHTML = "";
  $("go").disabled = true;
  try {
    const res = await fetch("/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        learnerId: $("learner").value,
        packId: $("pack").value,
        diagnosticAnswer: $("diagnostic").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "diagnose failed");
    sessionId = data.sessionId;
    $("result").classList.add("visible");
    $("explanation").textContent = data.explanation;
    $("checkPrompt").textContent = data.check.prompt;
    $("verify").textContent = data.verification.ok
      ? `Verifier: ${data.verification.notes}`
      : `Verifier revised: ${data.verification.notes}`;
    $("verify").className = `status ${data.verification.ok ? "ok" : "warn"}`;
    $("evidence").innerHTML = (data.evidence || [])
      .map(
        (e) =>
          `<dt>${e.source_title}</dt><dd>${e.page_or_section || "n/a"} · ${e.attribution}</dd>`,
      )
      .join("");
    $("citations").innerHTML = (data.citations || [])
      .map(
        (c) =>
          `<dt>${c.source_title}</dt><dd>${c.note} ${c.source_url ? `<a href="${c.source_url}">${c.source_url}</a>` : ""}</dd>`,
      )
      .join("");
    $("hmemMeta").textContent = `H-MEM ${data.hmem.source} pin ${data.hmem.pin}`;
    renderTrace(data.trace);
    await drawMermaid(data.visual?.mermaid);
    $("status").textContent = "Evidence-backed explanation ready.";
  } catch (err) {
    $("status").textContent = err.message;
  } finally {
    $("go").disabled = false;
  }
});

$("submitCheck").addEventListener("click", async () => {
  $("submitCheck").disabled = true;
  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, answer: $("check").value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "check failed");
    $("outcome").innerHTML = `<strong class="${data.correct ? "ok" : "warn"}">${data.branch}</strong> — ${data.followUp.explanation}`;
    if (data.followUp.mermaid) await drawMermaid(data.followUp.mermaid);
    renderTrace(data.trace);
  } catch (err) {
    $("outcome").textContent = err.message;
  } finally {
    $("submitCheck").disabled = false;
  }
});

bootstrap().catch((err) => {
  $("status").textContent = err.message;
});
