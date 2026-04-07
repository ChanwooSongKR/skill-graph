# Wisdom Nebula

`wisdom_4k_test.dump`를 가벼운 JSON graph artifact로 변환하고, Canvas 2D 기반의 인터랙티브 그래프로 보여주는 정적 웹 뷰어입니다.

## Run

1. Install the parser dependency:

```bash
python3 -m pip install -r requirements.txt
```

2. Build the graph data:

```bash
npm run build:data
```

3. Serve the static app:

```bash
npm run serve
```

4. Open `http://localhost:4173`

## Layouts

- `Cluster Flow`: 기본 레이아웃입니다. 구조를 읽을 수 있는 레이아웃이며, 군집과 흐름은 유지하되 고리나 줄기 같은 인위적인 형태는 피합니다.
- `Field`: 밀도와 허브 중심의 더 자연스러운 분포를 보여주는 탐색용 레이아웃입니다.

## Notes

- Main rendering is Canvas 2D, not SVG or WebGL.
- Layouts are precomputed during preprocessing to avoid runtime force simulation.
- The generated artifact lives at `public/data/wisdom-graph.json`.
