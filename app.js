(() => {
  const EPS = 1e-9;
  const DRAG_RADIUS_PX = 14;
  const ROUND_DIGITS = 3;
  const BASE_VECTOR_DRAW_LEN = 1;

  const canvas = document.getElementById("matrix-canvas");
  const ctx = canvas.getContext("2d");
  const tooltip = document.getElementById("drag-tooltip");
  const errorEl = document.getElementById("input-error");
  const resultsEl = document.getElementById("results");

  const matrixInputs = {
    a: document.getElementById("input-a"),
    b: document.getElementById("input-b"),
    c: document.getElementById("input-c"),
    d: document.getElementById("input-d")
  };

  const toggles = {
    autoScale: document.getElementById("auto-scale"),
    showCartesianGrid: document.getElementById("show-cartesian-grid"),
    showColumnVectors: document.getElementById("show-column-vectors"),
    showColumnVectorGrid: document.getElementById("show-column-grid"),
    showEigenVectors: document.getElementById("show-eigen-vectors"),
    showEigenGrid: document.getElementById("show-eigen-grid"),
    showInverseVectors: document.getElementById("show-inverse-vectors"),
    showInverseGrid: document.getElementById("show-inverse-grid")
  };

  const presets = {
    default: { a: 2, b: 1, c: 1, d: 2 },
    identity: { a: 1, b: 0, c: 0, d: 1 },
    rotation: { a: 0, b: -1, c: 1, d: 0 },
    diagonal: { a: 3, b: 0, c: 0, d: 1.5 },
    singular: { a: 1, b: 2, c: 2, d: 4 }
  };

  const state = {
    matrix: { ...presets.default },
    textBuffer: { a: "2", b: "1", c: "1", d: "2" },
    ui: {
      autoScale: true,
      showCartesianGrid: true,
      showColumnVectors: true,
      showColumnVectorGrid: true,
      showEigenVectors: true,
      showEigenGrid: false,
      showInverseVectors: true,
      showInverseGrid: false
    },
    drag: {
      activeKey: null
    },
    view: {
      manualScale: 60
    }
  };

  const vectors = {
    column1: { color: "#0ea5e9", label: "v1", dash: [] },
    column2: { color: "#f97316", label: "v2", dash: [] },
    eigen1: { color: "#8b5cf6", label: "e1", dash: [8, 4] },
    eigen2: { color: "#ec4899", label: "e2", dash: [8, 4] },
    eigen1Mapped: { color: "#6d28d9", label: "Av1", dash: [] },
    eigen2Mapped: { color: "#be185d", label: "Av2", dash: [] },
    inv1: { color: "#10b981", label: "inv_v1", dash: [5, 5] },
    inv2: { color: "#eab308", label: "inv_v2", dash: [5, 5] }
  };

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function parseBufferedNumber(raw) {
    if (raw.trim() === "") return { pending: true, value: null };
    const value = Number(raw);
    if (!Number.isFinite(value)) return { pending: true, value: null };
    return { pending: false, value };
  }

  function handleInputChange(key, rawValue) {
    state.textBuffer[key] = rawValue;
    const parsed = parseBufferedNumber(rawValue);
    if (!parsed.pending) {
      state.matrix[key] = parsed.value;
      errorEl.textContent = "";
      draw();
    }
  }

  function commitInput(key) {
    const parsed = parseBufferedNumber(state.textBuffer[key]);
    if (parsed.pending) {
      state.textBuffer[key] = String(state.matrix[key]);
      matrixInputs[key].value = state.textBuffer[key];
      errorEl.textContent = `「${key}」の値が不正なため直前の有効値に戻しました。`;
      draw();
      return;
    }
    state.matrix[key] = parsed.value;
    state.textBuffer[key] = String(parsed.value);
    matrixInputs[key].value = state.textBuffer[key];
    errorEl.textContent = "";
    draw();
  }

  function determinant(m) {
    return m.a * m.d - m.b * m.c;
  }

  function normalize(v) {
    const len = Math.hypot(v.x, v.y);
    if (len < EPS) return null;
    return { x: v.x / len, y: v.y / len, length: len };
  }

  function roundNum(n, digits = ROUND_DIGITS) {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
  }

  function computeEigen(matrix) {
    const tr = matrix.a + matrix.d;
    const det = determinant(matrix);
    const discriminant = tr * tr - 4 * det;

    if (discriminant < -EPS) {
      return {
        hasRealEigenvalues: false,
        isAllDirectionsEigenvectors: false,
        values: [],
        vectors: [],
        message: "実数固有値なし"
      };
    }

    const delta = discriminant < 0 ? 0 : Math.sqrt(discriminant);
    const lambda1 = (tr + delta) / 2;
    const lambda2 = (tr - delta) / 2;

    if (Math.abs(matrix.b) < EPS && Math.abs(matrix.c) < EPS && Math.abs(matrix.a - matrix.d) < EPS) {
      return {
        hasRealEigenvalues: true,
        isAllDirectionsEigenvectors: true,
        values: [lambda1],
        vectors: [],
        message: "全方向が固有ベクトル"
      };
    }

    const getVectorForLambda = (lambda) => {
      let x;
      let y;
      if (Math.abs(matrix.b) > EPS) {
        x = 1;
        y = -((matrix.a - lambda) / matrix.b);
      } else if (Math.abs(matrix.c) > EPS) {
        x = -((matrix.d - lambda) / matrix.c);
        y = 1;
      } else if (Math.abs(matrix.a - lambda) < EPS) {
        x = 1;
        y = 0;
      } else if (Math.abs(matrix.d - lambda) < EPS) {
        x = 0;
        y = 1;
      } else {
        x = 1;
        y = 0;
      }
      return normalize({ x, y });
    };

    const v1 = getVectorForLambda(lambda1);
    const v2 = getVectorForLambda(lambda2);
    const vectors = [v1, v2].filter(Boolean);

    if (Math.abs(lambda1 - lambda2) < EPS) {
      if (!v1) {
        return {
          hasRealEigenvalues: true,
          isAllDirectionsEigenvectors: false,
          values: [lambda1],
          vectors: [],
          message: "固有ベクトルを数値的に決定できません"
        };
      }
      return {
        hasRealEigenvalues: true,
        isAllDirectionsEigenvectors: false,
        values: [lambda1],
        vectors: [v1],
        message: "重解: 1方向の固有ベクトル"
      };
    }

    return {
      hasRealEigenvalues: true,
      isAllDirectionsEigenvectors: false,
      values: [lambda1, lambda2],
      vectors,
      message: ""
    };
  }

  function computeInverse(matrix) {
    const det = determinant(matrix);
    if (Math.abs(det) < EPS) {
      return { exists: false, matrix: null };
    }
    return {
      exists: true,
      matrix: {
        a: matrix.d / det,
        b: -matrix.b / det,
        c: -matrix.c / det,
        d: matrix.a / det
      }
    };
  }

  function computeState(matrix) {
    const det = determinant(matrix);
    const eigen = computeEigen(matrix);
    const inverse = computeInverse(matrix);
    return { determinant: det, eigen, inverse };
  }

  function getEigenDrawItems(eigen) {
    if (!eigen.hasRealEigenvalues || eigen.isAllDirectionsEigenvectors) return [];
    return eigen.vectors.map((v, idx) => {
      const lambda = eigen.values[Math.min(idx, eigen.values.length - 1)] ?? 0;
      return { v, lambda, idx };
    });
  }

  function toScreen(world, view) {
    return {
      x: view.originX + world.x * view.scale,
      y: view.originY - world.y * view.scale
    };
  }

  function toWorld(screen, view) {
    return {
      x: (screen.x - view.originX) / view.scale,
      y: (view.originY - screen.y) / view.scale
    };
  }

  function computeAutoScale(computed, width, height) {
    const margin = 28;
    const points = [
      { x: state.matrix.a, y: state.matrix.c },
      { x: state.matrix.b, y: state.matrix.d }
    ];

    if (computed.inverse.exists) {
      points.push(
        { x: computed.inverse.matrix.a, y: computed.inverse.matrix.c },
        { x: computed.inverse.matrix.b, y: computed.inverse.matrix.d }
      );
    }

    const eigenDrawItems = getEigenDrawItems(computed.eigen);
    for (const item of eigenDrawItems) {
      const base = { x: item.v.x * BASE_VECTOR_DRAW_LEN, y: item.v.y * BASE_VECTOR_DRAW_LEN };
      const mapped = { x: base.x * item.lambda, y: base.y * item.lambda };
      points.push(base, mapped);
    }

    let maxAbs = 2;
    for (const p of points) {
      maxAbs = Math.max(maxAbs, Math.abs(p.x), Math.abs(p.y));
    }

    const safeMax = Math.min(maxAbs * 1.25 + 0.25, 25);
    const unitPixelsX = (width - margin * 2) / (2 * safeMax);
    const unitPixelsY = (height - margin * 2) / (2 * safeMax);
    return Math.max(8, Math.min(unitPixelsX, unitPixelsY));
  }

  function chooseView(computed) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const autoScale = computeAutoScale(computed, width, height);
    const scale = state.ui.autoScale ? autoScale : Math.max(8, state.view.manualScale);

    return {
      width,
      height,
      scale,
      originX: width / 2,
      originY: height / 2
    };
  }

  function drawAxis(view) {
    ctx.save();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    ctx.moveTo(0, view.originY);
    ctx.lineTo(view.width, view.originY);
    ctx.moveTo(view.originX, 0);
    ctx.lineTo(view.originX, view.height);
    ctx.stroke();

    ctx.fillStyle = "#1f2937";
    ctx.font = "12px sans-serif";
    ctx.fillText("x", view.width - 16, view.originY - 8);
    ctx.fillText("y", view.originX + 8, 14);
    ctx.fillText("O", view.originX + 6, view.originY + 14);
    ctx.restore();
  }

  function drawCartesianGrid(view) {
    const unit = chooseGridSpacing(view.scale);
    const halfX = view.width / view.scale / 2;
    const halfY = view.height / view.scale / 2;

    ctx.save();
    ctx.lineWidth = 1;

    for (let x = Math.floor(-halfX / unit) * unit; x <= halfX; x += unit) {
      const sx = view.originX + x * view.scale;
      ctx.strokeStyle = Math.abs(x) < EPS ? "#475569" : "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, view.height);
      ctx.stroke();
    }

    for (let y = Math.floor(-halfY / unit) * unit; y <= halfY; y += unit) {
      const sy = view.originY - y * view.scale;
      ctx.strokeStyle = Math.abs(y) < EPS ? "#475569" : "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(view.width, sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function chooseGridSpacing(scale) {
    const targetPx = 70;
    const raw = targetPx / scale;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const candidates = [1, 2, 5, 10];
    for (const c of candidates) {
      if (raw <= c * pow) return c * pow;
    }
    return 10 * pow;
  }

  function drawParallelGrid(view, p, q, color, alpha = 0.24) {
    if (!p || !q) return;
    const cross = p.x * q.y - p.y * q.x;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha;

    const maxSpan = Math.ceil(Math.max(view.width, view.height) / Math.max(view.scale, 1)) + 2;

    if (Math.abs(cross) < EPS) {
      drawParallelLines(view, p, color, alpha + 0.1);
      drawParallelLines(view, q, color, alpha + 0.1);
      ctx.restore();
      return;
    }

    for (let n = -maxSpan; n <= maxSpan; n += 1) {
      const offset = { x: q.x * n, y: q.y * n };
      const from = { x: offset.x - p.x * maxSpan, y: offset.y - p.y * maxSpan };
      const to = { x: offset.x + p.x * maxSpan, y: offset.y + p.y * maxSpan };
      strokeWorldLine(from, to, view);
    }

    for (let m = -maxSpan; m <= maxSpan; m += 1) {
      const offset = { x: p.x * m, y: p.y * m };
      const from = { x: offset.x - q.x * maxSpan, y: offset.y - q.y * maxSpan };
      const to = { x: offset.x + q.x * maxSpan, y: offset.y + q.y * maxSpan };
      strokeWorldLine(from, to, view);
    }
    ctx.restore();
  }

  function drawParallelLines(view, dir, color, alpha) {
    const n = normalize(dir);
    if (!n) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;

    const normal = { x: -n.y, y: n.x };
    const range = Math.ceil(Math.max(view.width, view.height) / view.scale);
    for (let i = -range; i <= range; i += 1) {
      const o = { x: normal.x * i, y: normal.y * i };
      const from = { x: o.x - n.x * range, y: o.y - n.y * range };
      const to = { x: o.x + n.x * range, y: o.y + n.y * range };
      strokeWorldLine(from, to, view);
    }
    ctx.restore();
  }

  function strokeWorldLine(a, b, view) {
    const sa = toScreen(a, view);
    const sb = toScreen(b, view);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }

  function drawVector(world, style, view, withHandle = false, labelOverride = null) {
    const origin = toScreen({ x: 0, y: 0 }, view);
    const tip = toScreen(world, view);
    const lengthPx = Math.hypot(tip.x - origin.x, tip.y - origin.y);

    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;
    ctx.lineWidth = 2.2;
    ctx.setLineDash(style.dash);

    if (lengthPx < 2) {
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();

    drawArrowHead(origin, tip, style.color);

    if (withHandle) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = style.color;
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.fillStyle = style.color;
    ctx.font = "12px sans-serif";
    const labelText = labelOverride || `${style.label} = (${roundNum(world.x)}, ${roundNum(world.y)})`;
    ctx.fillText(labelText, tip.x + 8, tip.y - 8);

    ctx.restore();
  }

  function drawArrowHead(from, to, color) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const size = 11;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 7), to.y - size * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 7), to.y - size * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function updateResultPane(computed) {
    const m = state.matrix;
    const det = computed.determinant;
    const col1 = { x: m.a, y: m.c };
    const col2 = { x: m.b, y: m.d };
    const col1Norm = Math.hypot(col1.x, col1.y);
    const col2Norm = Math.hypot(col2.x, col2.y);

    let html = "";
    html += `<div><strong>A</strong> = <code>[[${roundNum(m.a)}, ${roundNum(m.b)}], [${roundNum(m.c)}, ${roundNum(m.d)}]]</code></div>`;
    html += `<div>det(A) = <code>${roundNum(det)}</code></div>`;
    html += `<div>列ベクトル: <code>v1=(${roundNum(col1.x)}, ${roundNum(col1.y)}), |v1|=${roundNum(col1Norm)} / v2=(${roundNum(col2.x)}, ${roundNum(col2.y)}), |v2|=${roundNum(col2Norm)}</code></div>`;

    if (!computed.eigen.hasRealEigenvalues) {
      html += "<div>固有値: 実数固有値なし</div><div>固有ベクトル: 実数固有ベクトルなし</div>";
    } else if (computed.eigen.isAllDirectionsEigenvectors) {
      html += `<div>固有値: <code>λ = ${roundNum(computed.eigen.values[0])}</code></div>`;
      html += "<div>固有ベクトル: 全方向が固有ベクトル</div>";
    } else {
      const vTexts = computed.eigen.vectors.map((v, i) => `e${i + 1}=(${roundNum(v.x)}, ${roundNum(v.y)})`).join(" / ");
      const lTexts = computed.eigen.values.map((v, i) => `λ${i + 1}=${roundNum(v)}`).join(" / ");
      html += `<div>固有値: <code>${lTexts}</code></div>`;
      html += `<div>固有ベクトル(正規化): <code>${vTexts || "なし"}</code></div>`;
      if (computed.eigen.vectors.length > 0) {
        const mappedTexts = computed.eigen.vectors.map((v, i) => {
          const lambda = computed.eigen.values[Math.min(i, computed.eigen.values.length - 1)] ?? 0;
          const av = { x: v.x * lambda, y: v.y * lambda };
          return `Ae${i + 1}=(${roundNum(av.x)}, ${roundNum(av.y)}), |e${i + 1}|=${roundNum(Math.hypot(v.x, v.y))}, |Ae${i + 1}|=${roundNum(Math.hypot(av.x, av.y))}`;
        }).join(" / ");
        html += `<div>固有方向の座標比較: <code>${mappedTexts}</code></div>`;
      }
      if (computed.eigen.message) {
        html += `<div>${computed.eigen.message}</div>`;
      }
    }

    if (computed.inverse.exists) {
      const im = computed.inverse.matrix;
      html += `<div>逆行列: <code>[[${roundNum(im.a)}, ${roundNum(im.b)}], [${roundNum(im.c)}, ${roundNum(im.d)}]]</code></div>`;
    } else {
      html += "<div>逆行列: 逆行列なし</div>";
    }

    resultsEl.innerHTML = html;

    const eigenGridEnabled = computed.eigen.hasRealEigenvalues && !computed.eigen.isAllDirectionsEigenvectors && computed.eigen.vectors.length === 2 && Math.abs(computed.eigen.vectors[0].x * computed.eigen.vectors[1].y - computed.eigen.vectors[0].y * computed.eigen.vectors[1].x) > EPS;
    toggles.showEigenGrid.disabled = !eigenGridEnabled;
    if (!eigenGridEnabled) {
      toggles.showEigenGrid.checked = false;
      state.ui.showEigenGrid = false;
    }

    toggles.showInverseGrid.disabled = !computed.inverse.exists;
    if (!computed.inverse.exists) {
      toggles.showInverseGrid.checked = false;
      state.ui.showInverseGrid = false;
    }
  }

  function draw() {
    const computed = computeState(state.matrix);
    const view = chooseView(computed);

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    if (state.ui.showCartesianGrid) drawCartesianGrid(view);

    if (state.ui.showColumnVectorGrid) {
      drawParallelGrid(view, { x: state.matrix.a, y: state.matrix.c }, { x: state.matrix.b, y: state.matrix.d }, "#0284c7", 0.19);
    }

    if (state.ui.showEigenGrid && computed.eigen.vectors.length === 2) {
      drawParallelGrid(view, computed.eigen.vectors[0], computed.eigen.vectors[1], "#a855f7", 0.19);
    }

    if (state.ui.showInverseGrid && computed.inverse.exists) {
      drawParallelGrid(
        view,
        { x: computed.inverse.matrix.a, y: computed.inverse.matrix.c },
        { x: computed.inverse.matrix.b, y: computed.inverse.matrix.d },
        "#10b981",
        0.15
      );
    }

    drawAxis(view);

    if (state.ui.showColumnVectors) {
      drawVector({ x: state.matrix.a, y: state.matrix.c }, vectors.column1, view, true);
      drawVector({ x: state.matrix.b, y: state.matrix.d }, vectors.column2, view, true);
    }

    if (state.ui.showEigenVectors && computed.eigen.hasRealEigenvalues && !computed.eigen.isAllDirectionsEigenvectors) {
      const eigenDrawItems = getEigenDrawItems(computed.eigen);
      eigenDrawItems.forEach((item) => {
        const baseWorld = { x: item.v.x * BASE_VECTOR_DRAW_LEN, y: item.v.y * BASE_VECTOR_DRAW_LEN };
        const mappedWorld = { x: baseWorld.x * item.lambda, y: baseWorld.y * item.lambda };
        const eigenStyle = item.idx === 0 ? vectors.eigen1 : vectors.eigen2;
        const mappedStyle = item.idx === 0 ? vectors.eigen1Mapped : vectors.eigen2Mapped;
        const signText = item.lambda < 0 ? " (λ<0)" : "";
        drawVector(
          baseWorld,
          eigenStyle,
          view,
          false,
          `${eigenStyle.label}: |λ|=${roundNum(Math.abs(item.lambda))}${signText}`
        );
        drawVector(
          mappedWorld,
          mappedStyle,
          view,
          false,
          `${mappedStyle.label}=A${eigenStyle.label}: λ=${roundNum(item.lambda)}`
        );
      });
    }

    if (state.ui.showInverseVectors && computed.inverse.exists) {
      drawVector({ x: computed.inverse.matrix.a, y: computed.inverse.matrix.c }, vectors.inv1, view);
      drawVector({ x: computed.inverse.matrix.b, y: computed.inverse.matrix.d }, vectors.inv2, view);
    }

    updateResultPane(computed);
  }

  function findDragTarget(pointer, view) {
    const targets = [
      { key: "v1", world: { x: state.matrix.a, y: state.matrix.c } },
      { key: "v2", world: { x: state.matrix.b, y: state.matrix.d } }
    ];

    let found = null;
    for (const t of targets) {
      const screen = toScreen(t.world, view);
      const dist = Math.hypot(screen.x - pointer.x, screen.y - pointer.y);
      if (dist <= DRAG_RADIUS_PX) {
        found = t.key;
      }
    }
    return found;
  }

  function updateFromDrag(key, world) {
    const x = roundNum(world.x);
    const y = roundNum(world.y);
    if (key === "v1") {
      state.matrix.a = x;
      state.matrix.c = y;
      state.textBuffer.a = String(x);
      state.textBuffer.c = String(y);
      matrixInputs.a.value = String(x);
      matrixInputs.c.value = String(y);
    } else {
      state.matrix.b = x;
      state.matrix.d = y;
      state.textBuffer.b = String(x);
      state.textBuffer.d = String(y);
      matrixInputs.b.value = String(x);
      matrixInputs.d.value = String(y);
    }
  }

  function bindInputs() {
    Object.entries(matrixInputs).forEach(([key, input]) => {
      input.addEventListener("input", (e) => handleInputChange(key, e.target.value));
      input.addEventListener("blur", () => commitInput(key));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commitInput(key);
        }
      });
    });

    Object.entries(toggles).forEach(([key, checkbox]) => {
      checkbox.addEventListener("change", (e) => {
        if (key === "autoScale" && !e.target.checked) {
          state.view.manualScale = computeAutoScale(computeState(state.matrix), canvas.clientWidth, canvas.clientHeight);
        }
        state.ui[key] = e.target.checked;
        draw();
      });
    });

    document.querySelectorAll("[data-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        const preset = presets[button.getAttribute("data-preset")];
        state.matrix = { ...preset };
        Object.entries(preset).forEach(([k, v]) => {
          state.textBuffer[k] = String(v);
          matrixInputs[k].value = String(v);
        });
        errorEl.textContent = "";
        draw();
      });
    });
  }

  function bindDrag() {
    canvas.addEventListener("mousedown", (event) => {
      const rect = canvas.getBoundingClientRect();
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const view = chooseView(computeState(state.matrix));
      const target = findDragTarget(pointer, view);
      if (target) {
        state.drag.activeKey = target;
        canvas.style.cursor = "grabbing";
      }
    });

    window.addEventListener("mousemove", (event) => {
      if (!state.drag.activeKey) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const view = chooseView(computeState(state.matrix));
      const world = toWorld(pointer, view);
      updateFromDrag(state.drag.activeKey, world);
      tooltip.hidden = false;
      tooltip.style.left = `${Math.max(12, pointer.x + 14)}px`;
      tooltip.style.top = `${Math.max(12, pointer.y + 12)}px`;
      tooltip.textContent = `${state.drag.activeKey}: (${roundNum(world.x)}, ${roundNum(world.y)})`;
      draw();
    });

    window.addEventListener("mouseup", () => {
      if (state.drag.activeKey) {
        state.drag.activeKey = null;
        canvas.style.cursor = "default";
        tooltip.hidden = true;
        draw();
      }
    });

    canvas.addEventListener("mousemove", (event) => {
      if (state.drag.activeKey) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const view = chooseView(computeState(state.matrix));
      const target = findDragTarget(pointer, view);
      canvas.style.cursor = target ? "grab" : "default";
    });
  }

  function init() {
    bindInputs();
    bindDrag();
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    draw();
  }

  init();
})();
