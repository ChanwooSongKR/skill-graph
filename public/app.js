const canvas = document.getElementById("graph-canvas");
const ctx = canvas.getContext("2d");
const statusPill = document.getElementById("status-pill");
const statsGrid = document.getElementById("stats-grid");
const selectionPanel = document.getElementById("selection-panel");
const searchInput = document.getElementById("search-input");
const layoutSelect = document.getElementById("layout-select");
const edgeTypeSelect = document.getElementById("edge-type-select");
const weightRange = document.getElementById("weight-range");
const appShell = document.querySelector(".app-shell");
const panelToggle = document.getElementById("panel-toggle");
const panelReveal = document.getElementById("panel-reveal");
const inspector = document.querySelector(".inspector");

const state = {
  graph: null,
  width: 0,
  height: 0,
  dpr: Math.min(window.devicePixelRatio || 1, 2),
  camera: { x: 0, y: 0, scale: 0.28 },
  pointer: { dragging: false, lastX: 0, lastY: 0 },
  selectedIndex: -1,
  hoveredIndex: -1,
  visibleNodes: [],
  filter: {
    search: "",
    edgeType: "all",
    minWeight: 0.55,
    layout: "cluster-flow",
  },
  layoutTransition: null,
  frameRequested: false,
  backgroundCache: { key: "", canvas: document.createElement("canvas") },
  frameCache: { points: [], stamp: "" },
  searchMatches: null,
  selectedNeighborsCache: { index: -1, set: new Set() },
  inspectorCollapsed: false,
};

const palette = ["#97adbf", "#b9c7d3", "#d1af74", "#788794"];

async function boot() {
  resizeCanvas();
  attachEvents();

  const response = await fetch("./data/wisdom-graph.json");
  if (!response.ok) {
    throw new Error(`Failed to load graph data: ${response.status}`);
  }

  const graph = await response.json();
  hydrateGraph(graph);
  populateControls(graph);
  updateStats(graph);
  setStatus(`Loaded ${graph.meta.nodeCount.toLocaleString()} nodes`);
  requestRender();
}

function hydrateGraph(graph) {
  graph.nodeLowerLabels = graph.nodes.map((node) => `${node.label} ${node.id}`.toLowerCase());
  graph.edgeBuckets = { far: [], mid: [], near: [] };
  graph.adjacency = new Map();
  graph.backdropCandidates = graph.nodes
    .map((node, index) => [index, node.degree_norm + node.score * 0.2])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 160)
    .map(([index]) => index);

  graph.nodes.forEach((_, index) => {
    graph.adjacency.set(index, []);
  });

  graph.edges.forEach((edge, edgeIndex) => {
    const [source, target, edgeTypeIndex, edgeSourceIndex, weight] = edge;
    const weightValue = Number(weight);
    const importance =
      weightValue + graph.nodes[source].degree_norm * 0.4 + graph.nodes[target].degree_norm * 0.4;
    if (importance >= 1.18) {
      graph.edgeBuckets.far.push(edgeIndex);
    }
    if (importance >= 0.84) {
      graph.edgeBuckets.mid.push(edgeIndex);
    }
    graph.edgeBuckets.near.push(edgeIndex);

    graph.adjacency.get(source).push(edgeIndex);
    graph.adjacency.get(target).push(edgeIndex);

    edge.importance = importance;
    edge.edgeTypeIndex = edgeTypeIndex;
    edge.edgeSourceIndex = edgeSourceIndex;
  });

  state.graph = graph;
  state.filter.layout = resolveLayoutName(graph, state.filter.layout);
  graph.layouts.current = graph.layouts[state.filter.layout];
  updateSearchMatches();
}

function populateControls(graph) {
  graph.filters.edgeTypes.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    edgeTypeSelect.append(option);
  });

  layoutSelect.value = state.filter.layout;
}

function updateStats(graph) {
  const statItems = [
    ["Nodes", graph.meta.nodeCount.toLocaleString()],
    ["Edges", graph.meta.edgeCount.toLocaleString()],
    ["Edge Types", graph.filters.edgeTypes.length.toString()],
    ["Layouts", ["field", "cluster-flow"].length.toString()],
  ];

  statsGrid.innerHTML = "";
  statItems.forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "stat";
    item.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    statsGrid.append(item);
  });
}

function setStatus(message) {
  statusPill.textContent = message;
}

function syncInspectorState() {
  appShell.classList.toggle("panel-collapsed", state.inspectorCollapsed);
  panelToggle.textContent = state.inspectorCollapsed ? "Show Panel" : "Hide Panel";
  panelToggle.setAttribute("aria-expanded", String(!state.inspectorCollapsed));
  inspector.setAttribute("aria-hidden", String(state.inspectorCollapsed));
  panelReveal.hidden = !state.inspectorCollapsed;
}

function attachEvents() {
  window.addEventListener("resize", () => {
    resizeCanvas();
    invalidateBackdrop();
    requestRender();
  });

  canvas.addEventListener("mousedown", (event) => {
    state.pointer.dragging = true;
    state.pointer.lastX = event.clientX;
    state.pointer.lastY = event.clientY;
  });

  window.addEventListener("mouseup", () => {
    state.pointer.dragging = false;
  });

  window.addEventListener("mousemove", (event) => {
    if (state.pointer.dragging) {
      const dx = event.clientX - state.pointer.lastX;
      const dy = event.clientY - state.pointer.lastY;
      state.camera.x -= dx / state.camera.scale;
      state.camera.y -= dy / state.camera.scale;
      state.pointer.lastX = event.clientX;
      state.pointer.lastY = event.clientY;
      invalidateBackdrop();
      requestRender();
      return;
    }
    updateHover(event);
  });

  canvas.addEventListener("click", (event) => {
    const nodeIndex = pickNode(event.clientX, event.clientY);
    if (nodeIndex === -1) {
      state.selectedIndex = -1;
      renderSelection(null);
    } else {
      focusNode(nodeIndex, { animate: false });
    }
    requestRender();
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.12;
      const before = screenToWorld(event.clientX, event.clientY);
      state.camera.scale = clamp(state.camera.scale * zoomFactor, 0.08, 2.8);
      const after = screenToWorld(event.clientX, event.clientY);
      state.camera.x += before.x - after.x;
      state.camera.y += before.y - after.y;
      invalidateBackdrop();
      requestRender();
    },
    { passive: false }
  );

  searchInput.addEventListener("input", () => {
    state.filter.search = searchInput.value.trim().toLowerCase();
    updateSearchMatches();
    if (!state.filter.search) {
      setStatus("Search cleared");
      requestRender();
      return;
    }
    const matchIndex = state.graph.nodeLowerLabels.findIndex((label) =>
      label.includes(state.filter.search)
    );
    if (matchIndex >= 0) {
      focusNode(matchIndex, { animate: true });
    } else {
      setStatus(`No results for "${searchInput.value.trim()}"`);
      requestRender();
    }
  });

  layoutSelect.addEventListener("change", () => {
    startLayoutTransition(layoutSelect.value);
  });

  edgeTypeSelect.addEventListener("change", () => {
    state.filter.edgeType = edgeTypeSelect.value;
    requestRender();
  });

  weightRange.addEventListener("input", () => {
    state.filter.minWeight = Number(weightRange.value) / 100;
    requestRender();
  });

  panelToggle.addEventListener("click", () => {
    state.inspectorCollapsed = !state.inspectorCollapsed;
    syncInspectorState();
    resizeCanvas();
    invalidateBackdrop();
    requestRender();
  });

  panelReveal.addEventListener("click", () => {
    state.inspectorCollapsed = false;
    syncInspectorState();
    resizeCanvas();
    invalidateBackdrop();
    requestRender();
  });
}

function startLayoutTransition(nextLayout) {
  if (!state.graph) {
    return;
  }
  const resolvedLayout = resolveLayoutName(state.graph, nextLayout);
  layoutSelect.value = resolvedLayout;
  if (resolvedLayout === state.filter.layout) {
    return;
  }
  state.layoutTransition = {
    from: state.graph.layouts.current,
    to: state.graph.layouts[resolvedLayout],
    startedAt: performance.now(),
    duration: 720,
  };
  state.filter.layout = resolvedLayout;
  invalidateBackdrop();
  requestRender();
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  state.width = rect.width;
  state.height = rect.height;
  canvas.width = Math.floor(rect.width * state.dpr);
  canvas.height = Math.floor(rect.height * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
}

function requestRender() {
  if (state.frameRequested) {
    return;
  }
  state.frameRequested = true;
  requestAnimationFrame(render);
}

function render(now) {
  state.frameRequested = false;
  if (!state.graph) {
    return;
  }

  updateLayoutFrame(now);
  prepareFrameCache();

  ctx.clearRect(0, 0, state.width, state.height);
  drawBackdrop();
  drawEdges();
  drawNodes();
  drawOverlayText();

  if (state.layoutTransition) {
    requestRender();
  }
}

function updateLayoutFrame(now = performance.now()) {
  const transition = state.layoutTransition;
  if (!transition) {
    state.graph.layouts.current = state.graph.layouts[state.filter.layout];
    return;
  }

  const progress = clamp((now - transition.startedAt) / transition.duration, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 3);
  const frame = new Array(transition.from.length);

  for (let index = 0; index < transition.from.length; index += 1) {
    const [fx, fy] = transition.from[index];
    const [tx, ty] = transition.to[index];
    frame[index] = [fx + (tx - fx) * eased, fy + (ty - fy) * eased];
  }

  state.graph.layouts.current = frame;
  if (progress >= 1) {
    state.layoutTransition = null;
  }
}

function drawBackdrop() {
  const cache = state.backgroundCache;
  const key = [
    state.width,
    state.height,
    state.filter.layout,
    state.selectedIndex,
    Math.round(state.camera.scale * 100),
    Math.round(state.camera.x),
    Math.round(state.camera.y),
  ].join(":");

  if (cache.key !== key) {
    const bgCanvas = cache.canvas;
    bgCanvas.width = Math.max(1, Math.floor(state.width * 0.25));
    bgCanvas.height = Math.max(1, Math.floor(state.height * 0.25));
    const bg = bgCanvas.getContext("2d");
    bg.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

    const gradient = bg.createLinearGradient(0, 0, bgCanvas.width, bgCanvas.height);
    gradient.addColorStop(0, "rgba(5, 9, 15, 0.98)");
    gradient.addColorStop(0.55, "rgba(10, 16, 24, 0.95)");
    gradient.addColorStop(1, "rgba(3, 7, 11, 1)");
    bg.fillStyle = gradient;
    bg.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

    const hubs = topVisibleCandidates(160);
    hubs.forEach((nodeIndex, order) => {
      const point = getProjectedPoint(nodeIndex);
      const x = (point.x / state.width) * bgCanvas.width;
      const y = (point.y / state.height) * bgCanvas.height;
      const radius = 14 + state.graph.nodes[nodeIndex].size * 3 + order * 0.02;
      const glow = bg.createRadialGradient(x, y, 0, x, y, radius);
      const color = palette[nodeIndex % palette.length];
      glow.addColorStop(0, `${hexToRgba(color, 0.22)}`);
      glow.addColorStop(1, `${hexToRgba(color, 0)}`);
      bg.fillStyle = glow;
      bg.beginPath();
      bg.arc(x, y, radius, 0, Math.PI * 2);
      bg.fill();
    });

    cache.key = key;
  }

  ctx.save();
  ctx.globalAlpha = 0.94;
  ctx.filter = "blur(0px)";
  ctx.drawImage(cache.canvas, 0, 0, state.width, state.height);
  ctx.restore();
}

function drawEdges() {
  const graph = state.graph;
  const bucket = currentEdgeBucket();
  const selectedNeighbors = selectedNeighborSet();
  const searchMatches = state.searchMatches;
  const highlightMode = state.selectedIndex >= 0;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 0; i < bucket.length; i += 1) {
    const edge = graph.edges[bucket[i]];
    const [sourceIndex, targetIndex, edgeTypeIndex, , weight] = edge;
    const edgeType = graph.filters.edgeTypes[edgeTypeIndex];

    if (state.filter.edgeType !== "all" && edgeType !== state.filter.edgeType) {
      continue;
    }
    if (weight < state.filter.minWeight) {
      continue;
    }

    if (searchMatches && !searchMatches.has(sourceIndex) && !searchMatches.has(targetIndex)) {
      continue;
    }

    const p0 = getProjectedPoint(sourceIndex);
    const p1 = getProjectedPoint(targetIndex);

    if (!segmentMayBeVisible(p0, p1)) {
      continue;
    }

    let alpha = 0.035 + weight * 0.08;
    let stroke = "rgba(151, 173, 191, 0.12)";
    if (edgeType === "col") {
      stroke = "rgba(209, 175, 116, 0.12)";
    } else if (edgeType === "ness") {
      stroke = "rgba(185, 199, 211, 0.1)";
    }

    if (highlightMode) {
      const highlighted =
        selectedNeighbors.has(sourceIndex) && selectedNeighbors.has(targetIndex);
      alpha = highlighted ? 0.28 : 0.012;
      stroke = highlighted ? "rgba(238, 229, 210, 0.62)" : "rgba(255,255,255,0.02)";
    }

    ctx.strokeStyle = applyAlpha(stroke, alpha);
    ctx.lineWidth = highlightMode ? (alpha > 0.1 ? 1 : 0.45) : 0.3 + weight * 0.7;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawNodes() {
  const graph = state.graph;
  const visibleNodes = [];
  const searchMode = Boolean(state.filter.search);
  const selectedNeighbors = selectedNeighborSet();
  const searchMatches = state.searchMatches;

  for (let index = 0; index < graph.nodes.length; index += 1) {
    const node = graph.nodes[index];
    const matchesSearch = !searchMatches || searchMatches.has(index);
    if (!matchesSearch && (!selectedNeighbors.size || !selectedNeighbors.has(index))) {
      continue;
    }
    if (!passesNodeLod(node, index)) {
      continue;
    }

    const point = getProjectedPoint(index);
    if (!pointWithinViewport(point, 40)) {
      continue;
    }

    visibleNodes.push(index);
    const radius = node.size * (0.7 + state.camera.scale * 0.22);
    const isSelected = index === state.selectedIndex;
    const isHovered = index === state.hoveredIndex;
    const highlighted =
      isSelected || isHovered || (selectedNeighbors.size && selectedNeighbors.has(index));
    const color = palette[(node.group.charCodeAt(0) || 0) % palette.length];

    if (highlighted) {
      ctx.save();
      ctx.fillStyle = hexToRgba(color, isSelected ? 0.38 : 0.2);
      ctx.shadowBlur = isSelected ? 20 : 10;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * (isSelected ? 2.1 : 1.7), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = highlighted ? "#f2eadc" : hexToRgba(color, searchMode ? 0.5 : 0.38);
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  state.visibleNodes = visibleNodes;
}

function drawOverlayText() {
  if (state.camera.scale < 0.42 && state.selectedIndex === -1) {
    return;
  }

  ctx.save();
  ctx.font = "12px Avenir Next, Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(246, 241, 232, 0.8)";

  const labelNodes = state.selectedIndex >= 0 ? neighborhoodForLabels() : state.visibleNodes.slice(0, 12);
  labelNodes.forEach((index) => {
    const point = getProjectedPoint(index);
    if (!pointWithinViewport(point, 80)) {
      return;
    }
    ctx.fillText(state.graph.nodes[index].label, point.x + 10, point.y - 10);
  });
  ctx.restore();
}

function currentEdgeBucket() {
  if (state.selectedIndex >= 0 && state.camera.scale > 0.22) {
    return state.graph.adjacency.get(state.selectedIndex);
  }
  if (state.camera.scale < 0.18) {
    return state.graph.edgeBuckets.far;
  }
  if (state.camera.scale < 0.45) {
    return state.graph.edgeBuckets.mid;
  }
  return state.graph.edgeBuckets.near;
}

function passesNodeLod(node, index) {
  if (index === state.selectedIndex) {
    return true;
  }
  if (state.camera.scale < 0.14) {
    return node.degree_norm > 0.2;
  }
  if (state.camera.scale < 0.3) {
    return node.degree_norm > 0.05;
  }
  return true;
}

function selectedNeighborSet() {
  const cache = state.selectedNeighborsCache;
  if (cache.index === state.selectedIndex) {
    return cache.set;
  }
  if (state.selectedIndex < 0) {
    cache.index = -1;
    cache.set = new Set();
    return cache.set;
  }
  const neighborSet = new Set([state.selectedIndex]);
  state.graph.adjacency.get(state.selectedIndex).forEach((edgeIndex) => {
    const [source, target] = state.graph.edges[edgeIndex];
    neighborSet.add(source);
    neighborSet.add(target);
  });
  cache.index = state.selectedIndex;
  cache.set = neighborSet;
  return neighborSet;
}

function neighborhoodForLabels() {
  if (state.selectedIndex < 0) {
    return [];
  }
  return Array.from(selectedNeighborSet()).slice(0, 18);
}

function pickNode(clientX, clientY) {
  let best = { index: -1, dist: Infinity };
  const rect = canvas.getBoundingClientRect();
  state.visibleNodes.forEach((index) => {
    const point = getProjectedPoint(index);
    const dx = point.x - clientX + rect.left;
    const dy = point.y - clientY + rect.top;
    const dist = Math.hypot(dx, dy);
    const radius = state.graph.nodes[index].size * (0.7 + state.camera.scale * 0.22) + 5;
    if (dist < radius && dist < best.dist) {
      best = { index, dist };
    }
  });
  return best.index;
}

function updateHover(event) {
  const next = pickNode(event.clientX, event.clientY);
  if (next !== state.hoveredIndex) {
    state.hoveredIndex = next;
    requestRender();
  }
}

function focusNode(nodeIndex, { animate }) {
  state.selectedIndex = nodeIndex;
  const target = state.graph.layouts.current[nodeIndex];
  state.camera.x = target[0];
  state.camera.y = target[1];
  if (animate) {
    state.camera.scale = Math.max(state.camera.scale, 0.52);
  }
  renderSelection(state.graph.nodes[nodeIndex]);
  setStatus("Node selected");
  invalidateBackdrop();
  state.selectedNeighborsCache.index = -2;
}

function renderSelection(node) {
  if (!node) {
    selectionPanel.innerHTML = `
      <h2>No node selected</h2>
      <p class="muted">Select a node to inspect its connections and summary.</p>
    `;
    return;
  }

  const nodeIndex = state.selectedIndex;
  const neighbors = state.graph.adjacency
    .get(nodeIndex)
    .slice(0, 8)
    .map((edgeIndex) => {
      const [source, target] = state.graph.edges[edgeIndex];
      const other = source === nodeIndex ? target : source;
      return state.graph.nodes[other].label;
    });
  const uniqueNeighbors = [...new Set(neighbors)];

  const pills = [
    node.stage ? `stage:${node.stage}` : "stage:none",
    `degree:${node.degree}`,
    `evidence:${node.evidence}`,
    `score:${node.score.toFixed(2)}`,
  ];

  selectionPanel.innerHTML = `
    <h2>${escapeHtml(node.label)}</h2>
    <p class="muted">${escapeHtml(node.detail)}</p>
    <div class="pill-row">${pills.map((pill) => `<span class="pill">${escapeHtml(pill)}</span>`).join("")}</div>
    <div class="selection-meta">
      <div><strong>ID</strong><div class="muted">${escapeHtml(node.id)}</div></div>
      <div><strong>Group</strong><div class="muted">${escapeHtml(node.group)}</div></div>
    </div>
    <h3 style="margin-top:14px;">Nearby Wisdoms</h3>
    <ul class="neighbor-list">${uniqueNeighbors.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul>
  `;
}

function projectPoint([x, y]) {
  return {
    x: (x - state.camera.x) * state.camera.scale + state.width / 2,
    y: (y - state.camera.y) * state.camera.scale + state.height / 2,
  };
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.width / 2) / state.camera.scale + state.camera.x,
    y: (clientY - rect.top - state.height / 2) / state.camera.scale + state.camera.y,
  };
}

function pointWithinViewport(point, margin = 0) {
  return (
    point.x >= -margin &&
    point.x <= state.width + margin &&
    point.y >= -margin &&
    point.y <= state.height + margin
  );
}

function segmentMayBeVisible(a, b) {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return !(maxX < -30 || minX > state.width + 30 || maxY < -30 || minY > state.height + 30);
}

function topVisibleCandidates(limit) {
  return state.graph.backdropCandidates.slice(0, limit);
}

function resolveLayoutName(graph, requestedLayout) {
  if (graph.layouts[requestedLayout]) {
    return requestedLayout;
  }
  if (graph.layouts.field) {
    return "field";
  }
  const available = Object.keys(graph.layouts).find((name) => name !== "current");
  return available || requestedLayout;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function invalidateBackdrop() {
  state.backgroundCache.key = "";
}

function updateSearchMatches() {
  if (!state.graph || !state.filter.search) {
    state.searchMatches = null;
    return;
  }
  const matches = new Set();
  state.graph.nodeLowerLabels.forEach((label, index) => {
    if (label.includes(state.filter.search)) {
      matches.add(index);
    }
  });
  state.searchMatches = matches;
}

function prepareFrameCache() {
  const stamp = [
    state.width,
    state.height,
    Math.round(state.camera.x),
    Math.round(state.camera.y),
    Math.round(state.camera.scale * 1000),
    state.graph.layouts.current === state.graph.layouts[state.filter.layout] ? state.filter.layout : "transition",
  ].join(":");

  if (state.frameCache.stamp === stamp) {
    return;
  }

  const points = new Array(state.graph.layouts.current.length);
  for (let index = 0; index < state.graph.layouts.current.length; index += 1) {
    const [x, y] = state.graph.layouts.current[index];
    points[index] = {
      x: (x - state.camera.x) * state.camera.scale + state.width / 2,
      y: (y - state.camera.y) * state.camera.scale + state.height / 2,
    };
  }

  state.frameCache.points = points;
  state.frameCache.stamp = stamp;
}

function getProjectedPoint(index) {
  return state.frameCache.points[index];
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyAlpha(rgba, alpha) {
  return rgba.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`);
}

boot().catch((error) => {
  console.error(error);
  setStatus("Failed to load graph");
  selectionPanel.innerHTML = `<h2>Load failed</h2><p class="muted">${escapeHtml(error.message)}</p>`;
});
