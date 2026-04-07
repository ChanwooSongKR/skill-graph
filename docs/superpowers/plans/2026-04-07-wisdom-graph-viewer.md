# Wisdom Graph Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the artificial graph layouts with a natural `field` layout and a readable but still organic `cluster-flow` layout, while aligning the viewer theme with `megacode.ai`.

**Architecture:** Keep the existing offline preprocessing pipeline and Canvas 2D viewer. Change layout generation in `scripts/build_wisdom_graph.py` so the frontend receives only two new coordinate sets, then update the browser app to expose those layouts and render them with calmer node/edge styling.

**Tech Stack:** Python 3.11, unittest, vanilla HTML/CSS/JavaScript, Canvas 2D

---

### Task 1: Lock the new layout contract in tests

**Files:**
- Modify: `tests/test_build_wisdom_graph.py`
- Modify: `scripts/build_wisdom_graph.py`

- [ ] **Step 1: Write the failing test for the new layout names**

```python
def test_compact_graph_emits_field_and_cluster_flow_layouts(self) -> None:
    graph = compact_graph(
        [
            {
                "id": "w1",
                "p_id": "g1",
                "c_id": "c1",
                "r_id": "r1",
                "method": "Alpha insight",
                "stage": None,
                "references": "{ref1}",
                "cp_S": "0.9",
                "cp_N": "0.8",
                "pr_S": "0.7",
                "pr_N": "0.6",
                "evidence_count": "2",
            },
            {
                "id": "w2",
                "p_id": "g1",
                "c_id": "c2",
                "r_id": "r2",
                "method": "Beta insight",
                "stage": "synth",
                "references": "{ref2}",
                "cp_S": "0.5",
                "cp_N": "0.4",
                "pr_S": "0.6",
                "pr_N": "0.5",
                "evidence_count": "4",
            },
            {
                "id": "w3",
                "p_id": "g2",
                "c_id": "c3",
                "r_id": "r3",
                "method": "Gamma insight",
                "stage": "draft",
                "references": "{ref3}",
                "cp_S": "0.8",
                "cp_N": "0.8",
                "pr_S": "0.8",
                "pr_N": "0.8",
                "evidence_count": "3",
            },
        ],
        [
            {
                "id": "e1",
                "from_wisdom_id": "w1",
                "to_wisdom_id": "w2",
                "edge_type": "suff",
                "S": "1",
                "N": "0.5",
                "source": "aggregation",
                "reason": "shared_context",
            },
            {
                "id": "e2",
                "from_wisdom_id": "w2",
                "to_wisdom_id": "w3",
                "edge_type": "ness",
                "S": "0.8",
                "N": "0.4",
                "source": "aggregation",
                "reason": "bridge",
            },
        ],
    )
    self.assertEqual(sorted(graph["layouts"].keys()), ["cluster-flow", "field"])
    self.assertEqual(len(graph["layouts"]["field"]), 3)
    self.assertEqual(len(graph["layouts"]["cluster-flow"]), 3)
```

- [ ] **Step 2: Write the failing test for naturalism constraints**

```python
def test_layouts_do_not_emit_legacy_names(self) -> None:
    graph = compact_graph(sample_wisdom_rows(), sample_edge_rows())
    self.assertNotIn("nebula", graph["layouts"])
    self.assertNotIn("radial", graph["layouts"])
    self.assertNotIn("clustered", graph["layouts"])
    self.assertNotIn("synapse", graph["layouts"])
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python3 -m unittest tests/test_build_wisdom_graph.py -v`
Expected: FAIL because the script still emits legacy layout names

- [ ] **Step 4: Commit**

```bash
git add tests/test_build_wisdom_graph.py
git commit -m "test: lock new wisdom graph layout contract"
```

### Task 2: Replace artificial offline layouts with `field` and `cluster-flow`

**Files:**
- Modify: `scripts/build_wisdom_graph.py`
- Test: `tests/test_build_wisdom_graph.py`

- [ ] **Step 1: Add focused helper functions for deterministic layout shaping**

```python
def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _polar(angle: float, radius: float) -> tuple[float, float]:
    return math.cos(angle) * radius, math.sin(angle) * radius
```

- [ ] **Step 2: Implement the natural `field` layout**

```python
field_points: list[list[float]] = []
for index, node in enumerate(nodes):
    rank = rank_lookup[index]
    ratio = rank / max(1, len(nodes) - 1)
    base_angle = _hash_unit(node["id"], "field-angle") * math.tau
    sweep = _hash_unit(node["group"], "field-sweep") * math.tau * 0.35
    angle = base_angle * 0.65 + sweep + ratio * math.tau * 0.9
    radius = 80 + math.sqrt(rank + 1) * 20 + (1 - node["degree_norm"]) * 260
    drift_x = (_hash_unit(node["id"], "field-x") - 0.5) * 220
    drift_y = (_hash_unit(node["id"], "field-y") - 0.5) * 180
    x, y = _polar(angle, radius)
    field_points.append([round(x + drift_x, 2), round(y * 0.82 + drift_y, 2)])
```

- [ ] **Step 3: Implement the structured `cluster-flow` layout**

```python
anchor_angles = [0.08, 1.07, 2.41, 3.66, 4.85, 5.62]
for index, node in enumerate(nodes):
    group_key = groups[index] if groups[index] in cluster_lookup else "other"
    anchor_index = cluster_lookup[group_key] % len(anchor_angles)
    anchor_angle = anchor_angles[anchor_index]
    anchor_radius = 360 + (anchor_index % 3) * 110
    anchor_x, anchor_y = _polar(anchor_angle, anchor_radius)
    local_angle = _hash_unit(node["id"], "cluster-flow-angle") * math.tau
    local_radius = 24 + math.sqrt(rank_lookup[index] + 1) * 10
    skew = (_hash_unit(node["id"], "cluster-flow-skew") - 0.5) * 120
    x = anchor_x + math.cos(local_angle) * local_radius + skew
    y = anchor_y * 0.72 + math.sin(local_angle) * (local_radius * 0.85)
    layouts["cluster-flow"].append([round(x, 2), round(y, 2)])
```

- [ ] **Step 4: Update `_build_layouts` to emit only the new keys**

```python
layouts: dict[str, list[list[float]]] = {
    "field": [],
    "cluster-flow": [],
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 -m unittest tests/test_build_wisdom_graph.py -v`
Expected: PASS

- [ ] **Step 6: Regenerate the graph artifact**

Run: `python3 scripts/build_wisdom_graph.py wisdom_4k_test.dump public/data/wisdom-graph.json`
Expected: PASS with a rewritten `layouts` block containing only `field` and `cluster-flow`

- [ ] **Step 7: Commit**

```bash
git add scripts/build_wisdom_graph.py tests/test_build_wisdom_graph.py public/data/wisdom-graph.json
git commit -m "feat: generate natural wisdom graph layouts"
```

### Task 3: Update the frontend controls and defaults for the new layout system

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`

- [ ] **Step 1: Replace legacy layout options in the HTML**

```html
<select id="layout-select">
  <option value="field">Field</option>
  <option value="cluster-flow">Cluster Flow</option>
</select>
```

- [ ] **Step 2: Change the default filter state in JavaScript**

```javascript
filter: {
  search: "",
  edgeType: "all",
  minWeight: 0.55,
  layout: "field",
},
```

- [ ] **Step 3: Update stats to reflect the new layout count**

```javascript
["Layouts", ["field", "cluster-flow"].length.toString()],
```

- [ ] **Step 4: Run a syntax check**

Run: `node --check public/app.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js
git commit -m "feat: switch viewer to field and cluster-flow layouts"
```

### Task 4: Calm the graph rendering so nodes and edges feel less synthetic

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Replace the bright palette with restrained tonal values**

```javascript
const palette = ["#a8c3d8", "#9eacb8", "#d6b07a", "#6f7f8d"];
```

- [ ] **Step 2: Reduce edge color coding and rely more on opacity**

```javascript
let alpha = 0.03 + weight * 0.09;
let stroke = "rgba(168, 195, 216, 0.12)";
if (edgeType === "col") {
  stroke = "rgba(214, 176, 122, 0.11)";
}
if (highlightMode) {
  alpha = highlighted ? 0.36 : 0.012;
  stroke = highlighted ? "rgba(239, 232, 220, 0.58)" : "rgba(255,255,255,0.02)";
}
```

- [ ] **Step 3: Make unselected nodes read more like matter than badges**

```javascript
ctx.fillStyle = highlighted ? "#f3eadc" : hexToRgba(color, searchMode ? 0.52 : 0.42);
ctx.beginPath();
ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
ctx.fill();
```

- [ ] **Step 4: Retune the backdrop to support the calmer MEGA Code tone**

```css
#graph-canvas {
  background:
    radial-gradient(circle at 22% 18%, rgba(168, 195, 216, 0.08), transparent 20%),
    radial-gradient(circle at 78% 24%, rgba(214, 176, 122, 0.05), transparent 18%),
    linear-gradient(180deg, rgba(4, 9, 14, 0.94), rgba(3, 8, 13, 0.99));
}
```

- [ ] **Step 5: Run a syntax check**

Run: `node --check public/app.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "style: calm wisdom graph rendering"
```

### Task 5: Verify the full viewer flow with regenerated data

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the new layouts**

```md
- `Field`: default organic distribution for exploratory browsing
- `Cluster Flow`: structured grouping view with soft regional boundaries
```

- [ ] **Step 2: Run preprocessing tests**

Run: `python3 -m unittest tests/test_build_wisdom_graph.py -v`
Expected: PASS

- [ ] **Step 3: Rebuild graph data**

Run: `python3 scripts/build_wisdom_graph.py wisdom_4k_test.dump public/data/wisdom-graph.json`
Expected: PASS with fresh output

- [ ] **Step 4: Start the local server**

Run: `python3 -m http.server 8000`
Expected: `Serving HTTP on :: port 8000 (http://[::]:8000/)`

- [ ] **Step 5: Smoke-test the app**

Run: open `http://localhost:8000`
Expected: the viewer loads with `Field` selected by default, the alternate layout is `Cluster Flow`, and neither layout immediately reads as rings, spokes, or synapse trunks

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: describe natural wisdom graph layouts"
```
